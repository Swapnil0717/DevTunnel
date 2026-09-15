import { z } from "zod";
import type { Context } from "hono";
import type { Env, Variables } from "../types";
import { getEnv, type ValidatedEnv } from "../config/env";
import { checkRateLimit } from "./rateLimit";
import { errorResponse } from "./response";
import { logger } from "./logger";
import { getCached, setCached } from "./cache";
import { searchOpenSourceCatalog, type GithubCatalogRepoItem } from "./githubDiscovery";
import { mapGithubTopicsToTechStack } from "./techTopics";

/**
 * Shared building blocks for every "live, GitHub-wide catalog"
 * contributor route — currently `GET /github-projects`
 * (src/routes/githubProjects.ts) and `GET /github-open-source-tools`
 * (src/routes/githubOpenSourceTools.ts). Both routes are the same shape
 * end to end (search GitHub with a discovery-token-backed query, cache
 * the whole result set, paginate it in memory, map each item to the same
 * frontend `GithubProjectSummary` shape) and differ only in *which*
 * search query defines their catalog and which cache key/route path they
 * use — pulling that shared shape here once (rule 51: role-agnostic
 * logic shouldn't be duplicated) instead of copy-pasting the whole route
 * a second time.
 *
 * See `routes/githubProjects.ts`'s original doc comment for the full
 * reasoning on why this uses `GITHUB_DISCOVERY_TOKEN` (never a
 * contributor's own token) and why the scan is cached whole rather than
 * queried live per request — both apply identically to every catalog
 * built here.
 */

/**
 * 30 minutes: long enough that GitHub's global star/fork counts — which
 * move slowly at the population level these queries sample (popular,
 * non-archived, non-fork public repos) — can't drift meaningfully within
 * one cache window, short enough that a catalog still feels "live" to a
 * contributor browsing across a few sessions. Also protects the
 * GITHUB_DISCOVERY_TOKEN's shared rate-limit budget across *every*
 * catalog route: without this, a burst of contributor traffic on any one
 * of them could each trigger their own 10-call GitHub search walk.
 */
const CATALOG_CACHE_TTL_SECONDS = 30 * 60;

interface CatalogCacheEntry {
  scannedAt: string;
  items: GithubCatalogRepoItem[];
}

/**
 * Maps a raw GitHub search result to the frontend-facing
 * `GithubProjectSummary` shape (devtunnel-frontend's
 * `lib/github-projects/types.ts` — reused as-is by the Open Source Tools
 * catalog too; there is no separate "tool" shape on the frontend, it's
 * the same card/grid/filter UI over the same fields).
 */
function toSummary(item: GithubCatalogRepoItem) {
  // GitHub reports "NOASSERTION" as the spdx_id when it found a LICENSE
  // file but couldn't confidently match it to a known SPDX license —
  // that's not a real license name and would mislead a contributor into
  // thinking this repo has a clearly identified one, so it's treated the
  // same as "no license detected" (null), same as an actually-missing
  // license object.
  const license =
    item.license && item.license.spdx_id && item.license.spdx_id !== "NOASSERTION"
      ? item.license.spdx_id
      : (item.license?.name ?? null);

  return {
    id: item.full_name,
    slug: item.full_name.toLowerCase().replace("/", "--"),
    name: item.name,
    description: item.description ?? null,
    repositoryUrl: item.html_url,
    repositoryFullName: item.full_name,
    owner: {
      username: item.owner.login,
      name: null,
      avatarUrl: item.owner.avatar_url ?? null,
      profileUrl: item.owner.html_url,
    },
    primaryLanguage: item.language ?? null,
    // Raw GitHub topics are freeform (a repo can tag itself with its own
    // name, or a non-technology label) — mapGithubTopicsToTechStack
    // keeps only topics that match a real, recognized technology and
    // normalizes spelling variants to one canonical name, so this never
    // surfaces a repo name or junk label as a "tech stack" tag.
    techStack: mapGithubTopicsToTechStack(item.topics ?? [], item.language ?? null),
    license,
    stars: item.stargazers_count,
    forks: item.forks_count,
    openIssuesCount: item.open_issues_count,
    // Not fetched here: getting a true contributor count
    // (src/lib/githubRepo.ts `fetchRepositoryContributorCount`) costs one
    // extra GitHub request *per repository*, which doesn't scale across
    // a several-hundred-repo catalog built fresh on every cache miss.
    // `0` is an honest "not computed for this view", not a claim the
    // repository has no contributors — the per-repo onboarding/detail
    // flows that do need a real figure fetch it there instead.
    contributorCount: 0,
    createdAt: item.created_at,
    pushedAt: item.pushed_at,
  };
}

/**
 * Same `limit`/`before` contract every keyset-paginated list route in
 * this backend uses. `before` is an opaque offset into the cached
 * catalog array (not an ISO timestamp like `GET /issues` uses) since a
 * catalog's sort key is GitHub's own search ranking, not a timestamp —
 * the frontend never parses it, only round-trips whatever `X-Next-Cursor`
 * it was last given.
 */
export const catalogListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(24),
  before: z
    .string()
    .regex(/^\d+$/, "before must be a cursor returned by this endpoint")
    .optional(),
});

export interface CatalogRouteConfig {
  /** Logical name used only in log lines and the rate-limit bucket, e.g. "github-projects". */
  name: string;
  /** GitHub Search API `q` value defining this catalog's population. */
  discoveryQuery: string;
  /** KV cache key this catalog's scan is stored under. Must be unique per catalog. */
  cacheKey: string;
}

/**
 * Handles one `GET` request for a GitHub-wide catalog route: rate limit,
 * validate `limit`/`before`, serve from cache or run a fresh
 * `searchOpenSourceCatalog` scan, paginate in memory, respond. Shared by
 * every route built with this module so a fix or tuning change (cache
 * TTL, pagination semantics, error shape) only has to happen once.
 */
export async function handleCatalogListRequest(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  config: CatalogRouteConfig,
) {
  const env: ValidatedEnv = getEnv(c.env);

  const withinLimit = await checkRateLimit(c, {
    bucket: `${config.name}-list`,
    limit: 20,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsed = catalogListQuerySchema.safeParse({
    limit: c.req.query("limit"),
    before: c.req.query("before"),
  });
  if (!parsed.success) {
    return errorResponse(
      c,
      400,
      "invalid_query",
      parsed.error.issues[0]?.message ?? "Invalid query parameters",
    );
  }

  try {
    let catalog: GithubCatalogRepoItem[];

    const cached = await getCached<CatalogCacheEntry>(c.env, config.cacheKey);
    if (cached) {
      catalog = cached.items;
    } else {
      catalog = await searchOpenSourceCatalog(env, config.discoveryQuery);
      // Only cache a non-empty result — same "don't cache a bad scan"
      // posture GET /issues takes with GITHUB_SCAN_CACHE_KEY (rule 21).
      if (catalog.length > 0) {
        await setCached<CatalogCacheEntry>(
          c.env,
          config.cacheKey,
          { scannedAt: new Date().toISOString(), items: catalog },
          CATALOG_CACHE_TTL_SECONDS,
        );
      }
    }

    const { limit, before } = parsed.data;
    const startIndex = before ? Number(before) : 0;
    const page = catalog.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < catalog.length;

    if (hasMore) {
      c.header("X-Next-Cursor", String(startIndex + limit));
    }

    return c.json(page.map(toSummary), 200);
  } catch (err) {
    logger.error(`${config.name}_list_failed`, {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load this catalog right now");
  }
}