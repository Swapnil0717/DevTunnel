import { z } from "zod";
import type { Context } from "hono";
import type { Env, Variables } from "../types";
import { getEnv, type ValidatedEnv } from "../config/env";
import { checkRateLimit } from "./rateLimit";
import { errorResponse } from "./response";
import { logger } from "./logger";
import { withCacheSWR, warmCacheSWR } from "./cache";
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
 *
 * This is the *soft* TTL for `withCacheSWR` below — "how fresh should this
 * ideally be" — not a hard expiry. A scheduled warmer (lib/cacheWarmers.ts,
 * `[triggers].crons` in wrangler.toml) re-runs `scanCatalog` for every
 * catalog on a ~25 minute cadence, comfortably inside this window, so in
 * steady state no real contributor request should ever actually see a
 * stale or missing entry — this TTL mainly governs what happens if that
 * warmer run is ever late or fails.
 */
const CATALOG_CACHE_SOFT_TTL_SECONDS = 30 * 60;

/**
 * How long a catalog entry survives in KV as a usable *stale* fallback if
 * nothing has refreshed it — three soft-TTL windows, so a warmer outage of
 * up to a couple of hours still degrades to "serves an older catalog
 * instantly" rather than "a contributor's request pays for a live GitHub
 * Search walk". Exported so `lib/cacheWarmers.ts` writes with the exact
 * same hard TTL this route reads with.
 */
export const CATALOG_CACHE_HARD_TTL_SECONDS = CATALOG_CACHE_SOFT_TTL_SECONDS * 3;

export interface CatalogCacheEntry {
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
 *
 * `filter` is optional and, when present, must be one of the named
 * filters a given route's `CatalogRouteConfig.filters` declares (see
 * below) — validated against that specific route's filter set inside
 * `handleCatalogListRequest`, not here, since the set of valid values
 * differs per route and this schema is shared by all of them.
 */
export const catalogListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(24),
  before: z
    .string()
    .regex(/^\d+$/, "before must be a cursor returned by this endpoint")
    .optional(),
  filter: z.string().optional(),
});

/**
 * One named, selectable narrowing of a catalog's base population —
 * e.g. "Alternative to paid software" on `/github-open-source-tools`.
 * Deliberately a *whole replacement* set of discovery queries rather
 * than a fragment appended to `CatalogRouteConfig.discoveryQueries`:
 * GitHub Search's qualifiers don't compose safely by string
 * concatenation (parenthesized OR-groups, `in:` qualifiers, etc. can
 * conflict when naively joined), so each filter spells out its own
 * complete, self-contained queries instead. `cacheKey` must be unique
 * per filter (and distinct from the route's own base `cacheKey`) since
 * a filtered catalog is a different result set from the unfiltered one
 * and both may be warm in cache at once.
 */
export interface CatalogFilterConfig {
  /**
   * One or more GitHub Search API `q` values for this filter's
   * narrowed population, each run as its own separate search and
   * merged/de-duplicated by `scanCatalog` below. Must be more than one
   * entry whenever the population is naturally an OR of several
   * `qualifier:value` pairs (e.g. several `topic:` values) — GitHub's
   * Search API does not support OR between qualifiers in a single
   * query. Confirmed directly against the live API: an unparenthesized
   * `topic:a OR topic:b` 422s with "Logical operators only apply to
   * text, not to qualifiers", and parenthesizing it
   * (`(topic:a OR topic:b)`) avoids that error but silently matches
   * close to nothing instead — GitHub simply doesn't group qualifiers
   * that way. A single-element array is fine (and equivalent to the
   * old single-query shape) when the population needs no OR at all,
   * e.g. `/github-projects`'s base catalog.
   */
  discoveryQueries: string[];
  /** KV cache key this filter's scan is stored under. Must be unique across the whole app. */
  cacheKey: string;
}

export interface CatalogRouteConfig {
  /** Logical name used only in log lines and the rate-limit bucket, e.g. "github-projects". */
  name: string;
  /** One or more GitHub Search API `q` values defining this catalog's population — see `CatalogFilterConfig.discoveryQueries` above for why this is an array. */
  discoveryQueries: string[];
  /** KV cache key this catalog's scan is stored under. Must be unique per catalog. */
  cacheKey: string;
  /**
   * Optional named filters a caller can select via `?filter=<key>`
   * instead of the base `discoveryQueries`/`cacheKey` above. Keyed by
   * the value the frontend sends on the wire (e.g.
   * `"alternative-to-paid"`). A route with no filters simply omits
   * this — `?filter=` on such a route is rejected the same way an
   * unrecognized key is (see `handleCatalogListRequest`), rather than
   * silently ignored, so a frontend typo never quietly falls back to
   * the unfiltered catalog.
   */
  filters?: Record<string, CatalogFilterConfig>;
}

/**
 * Runs each of `queries` as its own independent `searchOpenSourceCatalog`
 * scan and merges the results into one de-duplicated, stars-sorted list.
 * This is the OR-across-qualifiers workaround `CatalogFilterConfig`'s
 * doc comment describes: GitHub Search can't OR multiple `topic:`
 * qualifiers in a single query, so a catalog that's conceptually "topic
 * A OR topic B OR topic C" has to be built from separate per-topic
 * searches instead, unioned here.
 *
 * De-duplicates by `full_name` (a repo can legitimately match more than
 * one query, e.g. a repo tagged both `topic:cli` and `topic:devtools`)
 * — kept once, sorted by star count descending like a single-query scan
 * would already be from GitHub's own `sort=stars`.
 */
export async function scanCatalog(
  env: ValidatedEnv,
  queries: string[],
): Promise<GithubCatalogRepoItem[]> {
  const byFullName = new Map<string, GithubCatalogRepoItem>();

  for (const query of queries) {
    const items = await searchOpenSourceCatalog(env, query);
    for (const item of items) {
      const existing = byFullName.get(item.full_name);
      if (!existing || item.stargazers_count > existing.stargazers_count) {
        byFullName.set(item.full_name, item);
      }
    }
  }

  return Array.from(byFullName.values()).sort(
    (a, b) => b.stargazers_count - a.stargazers_count,
  );
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
    filter: c.req.query("filter"),
  });
  if (!parsed.success) {
    return errorResponse(
      c,
      400,
      "invalid_query",
      parsed.error.issues[0]?.message ?? "Invalid query parameters",
    );
  }

  // Resolve which discovery query/cache key this request actually uses:
  // the route's base catalog, or — when `?filter=` names one of this
  // route's declared `filters` — that filter's own complete query and
  // cache slot. An unrecognized filter (including any `?filter=` on a
  // route that declares none) is a 400, not a silent fallback to the
  // unfiltered catalog, so a frontend bug surfaces immediately instead
  // of quietly serving the wrong list.
  let discoveryQueries = config.discoveryQueries;
  let cacheKey = config.cacheKey;
  if (parsed.data.filter !== undefined) {
    const filterConfig = config.filters?.[parsed.data.filter];
    if (!filterConfig) {
      return errorResponse(
        c,
        400,
        "invalid_filter",
        `Unknown filter "${parsed.data.filter}" for this catalog`,
      );
    }
    discoveryQueries = filterConfig.discoveryQueries;
    cacheKey = filterConfig.cacheKey;
  }

  try {
    // Stale-while-revalidate: a fresh cache entry is returned as-is; a
    // stale-but-present one is still returned immediately while a real
    // refresh happens in the background (`c.executionCtx.waitUntil`), so
    // this request is never the one that blocks on a live GitHub Search
    // walk. Only a true miss (nothing in KV at all — see
    // `CATALOG_CACHE_HARD_TTL_SECONDS`'s doc comment) pays for that walk
    // synchronously, and in steady state the scheduled warmer
    // (lib/cacheWarmers.ts) should mean that never happens for real traffic.
    const catalog = await withCacheSWR<GithubCatalogRepoItem[]>(
      c.executionCtx,
      c.env,
      cacheKey,
      { softTtlSeconds: CATALOG_CACHE_SOFT_TTL_SECONDS, hardTtlSeconds: CATALOG_CACHE_HARD_TTL_SECONDS },
      async () => {
        const scanned = await scanCatalog(env, discoveryQueries);
        // Only cache a non-empty result — same "don't cache a bad scan"
        // posture GET /issues takes with GITHUB_SCAN_CACHE_KEY (rule 21).
        return scanned.length > 0 ? scanned : null;
      },
    );

    // `catalog` is only ever `null` here if this was a true cache miss AND
    // the synchronous refresh above also came back empty (e.g. GitHub
    // Search genuinely returned nothing for this query right now) — treat
    // that the same as "nothing cached yet", an empty catalog, rather than
    // an error.
    const items = catalog ?? [];

    const { limit, before } = parsed.data;
    const startIndex = before ? Number(before) : 0;
    const page = items.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < items.length;

    if (hasMore) {
      c.header("X-Next-Cursor", String(startIndex + limit));
    }

    return c.json(page.map(toSummary), 200);
  } catch (err) {
    logger.error(`${config.name}_list_failed`, {
      error: err instanceof Error ? err.message : String(err),
      filter: parsed.data.filter ?? null,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load this catalog right now");
  }
}

/**
 * Unconditionally re-scans and re-caches one catalog slot (a route's base
 * catalog, or one of its named `filters`) — called by the scheduled cache
 * warmer (`lib/cacheWarmers.ts`), never by a request handler. Uses
 * `warmCacheSWR` rather than `withCacheSWR`: a cron trigger always wants a
 * real fresh scan, never whatever's currently cached.
 */
export async function warmCatalogCacheKey(
  env: ValidatedEnv,
  workerEnv: Env,
  cacheKey: string,
  discoveryQueries: string[],
): Promise<void> {
  await warmCacheSWR<GithubCatalogRepoItem[]>(
    workerEnv,
    cacheKey,
    CATALOG_CACHE_HARD_TTL_SECONDS,
    async () => {
      const scanned = await scanCatalog(env, discoveryQueries);
      return scanned.length > 0 ? scanned : null;
    },
  );
}

/**
 * Warms every cache slot a `CatalogRouteConfig` can ever serve — its base
 * catalog plus every named filter — so the scheduled warmer only needs one
 * call per route (`lib/cacheWarmers.ts`) regardless of how many filters
 * that route declares.
 */
export async function warmCatalogRoute(
  env: ValidatedEnv,
  workerEnv: Env,
  config: CatalogRouteConfig,
): Promise<void> {
  await warmCatalogCacheKey(env, workerEnv, config.cacheKey, config.discoveryQueries);

  for (const filterConfig of Object.values(config.filters ?? {})) {
    await warmCatalogCacheKey(env, workerEnv, filterConfig.cacheKey, filterConfig.discoveryQueries);
  }
}