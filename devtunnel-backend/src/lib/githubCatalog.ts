import { z } from "zod";
import type { Context } from "hono";
import type { Env, Variables } from "../types";
import { getEnv, type ValidatedEnv } from "../config/env";
import { checkRateLimit } from "./rateLimit";
import { errorResponse } from "./response";
import { logger } from "./logger";
import { getCachedSWR, setCachedSWR, tryAcquireLock, releaseLock } from "./cache";
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
 *
 * ---------------------------------------------------------------------
 * Why the scan/cache design below looks the way it does
 * ---------------------------------------------------------------------
 * An earlier version of this module made `/github-open-source-tools`
 * unusable (the page just said "check back soon") because of three
 * compounding problems, each of which is now handled explicitly:
 *
 *  1. GitHub's Search API allows only 30 requests/minute per token, but
 *     the tools catalog is 7 topic queries x up to 10 pages each, run with
 *     no spacing. The scan hit the limit around its 30th call, threw, and
 *     discarded everything gathered so far. -> Calls are now paced
 *     (`lib/githubDiscovery.ts`), each topic is capped to a few pages
 *     (`CatalogRouteConfig.maxPagesPerQuery`), a rate limit stops the scan
 *     but keeps what it has, and one failing query no longer voids the
 *     others (`scanCatalog`).
 *
 *  2. The cache stored raw GitHub search items (~5 KB each) instead of
 *     the ~0.7 KB summaries the route actually serves. A few thousand
 *     repos pushed the value past Workers KV's 25 MiB per-value limit, so
 *     every cache write silently failed (`setCachedSWR` fails open) and the
 *     cache never held anything. -> The cache now stores `CatalogSummary`
 *     objects (`toSummary` runs once at scan time, not on every read).
 *
 *  3. With no cache, every request paid for a full live scan, and every
 *     stale read spawned another one. -> A cold cache now triggers at most
 *     one quick, single-page-per-topic scan (guarded by a KV lock so
 *     concurrent requests can't pile on), and the scheduled warmer
 *     (`lib/cacheWarmers.ts`) owns all full refreshes. Request handlers
 *     never start a full scan themselves.
 */

/**
 * 30 minutes: long enough that GitHub's global star/fork counts — which
 * move slowly at the population level these queries sample (popular,
 * non-archived, non-fork public repos) — can't drift meaningfully within
 * one cache window, short enough that a catalog still feels "live" to a
 * contributor browsing across a few sessions. Also protects the
 * GITHUB_DISCOVERY_TOKEN's shared rate-limit budget across *every*
 * catalog route.
 *
 * This is the *soft* TTL — "how fresh should this ideally be" — not a
 * hard expiry. A scheduled warmer (lib/cacheWarmers.ts,
 * `[triggers].crons` in wrangler.toml) re-runs `scanCatalog` for every
 * catalog on a ~25 minute cadence, comfortably inside this window. A
 * stale entry is still served (and logged) rather than blocking a
 * contributor's request on a live scan.
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

/**
 * GitHub's Search API returns at most 1,000 results per query = 10 pages
 * of 100. Routes that OR many topics together (one query per topic) can
 * lower this via `CatalogRouteConfig.maxPagesPerQuery` to stay inside
 * the 30-requests/minute Search budget.
 */
const DEFAULT_MAX_PAGES_PER_QUERY = 10;

/**
 * A cold-cache request only gets ONE page (top 100 by stars) per query —
 * enough for a usable page, cheap enough (7 calls for the tools base
 * catalog, ~15s paced) to run inside a request. The scheduled warmer
 * replaces it with the full catalog shortly after.
 */
const COLD_START_MAX_PAGES_PER_QUERY = 1;

/**
 * The scheduled warmer runs in the background (no user waiting), so if it
 * hits GitHub's rate limit it may sit out up to one full minute-window
 * and retry once instead of giving up on the rest of the catalog.
 */
const WARM_MAX_RATE_LIMIT_WAIT_SECONDS = 65;

/**
 * All catalog scans share one GitHub token, so they share one lock: only
 * one scan (warmer or cold-start request) runs at a time. TTL comfortably
 * exceeds the slowest scan (~45s paced + at most one 65s rate-limit wait).
 */
const SCAN_LOCK_NAME = "github-catalog-scan";
const SCAN_LOCK_TTL_SECONDS = 180;

/**
 * Per signed-in user, per catalog. The frontend walks the whole catalog
 * page by page on every load, so this must be comfortably above one
 * walk's page count; it exists only to stop runaway clients.
 */
const LIST_RATE_LIMIT_PER_MINUTE = 60;

/** Largest `limit` a caller may ask for — see `catalogListQuerySchema`. */
const MAX_PAGE_SIZE = 500;

/**
 * Maps a raw GitHub search result to the frontend-facing
 * `GithubProjectSummary` shape (devtunnel-frontend's
 * `lib/github-projects/types.ts` — reused as-is by the Open Source Tools
 * catalog too; there is no separate "tool" shape on the frontend, it's
 * the same card/grid/filter UI over the same fields).
 *
 * Runs once per repository at *scan* time and the result is what gets
 * cached — never the raw GitHub item, which carries ~80 fields (dozens
 * of API URL templates) this route never serves and would blow past KV's
 * per-value size limit at a few thousand repos.
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

/** One catalog row exactly as served to the frontend — and as cached. */
export type CatalogSummary = ReturnType<typeof toSummary>;

/**
 * Same `limit`/`before` contract every keyset-paginated list route in
 * this backend uses. `before` is an opaque offset into the cached
 * catalog array (not an ISO timestamp like `GET /issues` uses) since a
 * catalog's sort key is GitHub's own search ranking, not a timestamp —
 * the frontend never parses it, only round-trips whatever `X-Next-Cursor`
 * it was last given.
 *
 * `limit` may go up to `MAX_PAGE_SIZE` (500, up from 100): the frontend
 * walks the entire catalog on every page load, and at 100 rows per page a
 * few-thousand-repo catalog took 20-40 round trips — each one re-reading
 * and re-parsing the whole cached array from KV. At 500 it's a handful.
 *
 * `filter` is optional and, when present, must be one of the named
 * filters a given route's `CatalogRouteConfig.filters` declares (see
 * below) — validated against that specific route's filter set inside
 * `handleCatalogListRequest`, not here, since the set of valid values
 * differs per route and this schema is shared by all of them.
 */
export const catalogListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(24),
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
   * Max pages of 100 results to walk *per discovery query* during a full
   * (scheduled) scan. Defaults to 10 — GitHub's own ceiling of 1,000
   * results per query — which is fine for a single-query catalog. A
   * catalog built from many per-topic queries should set this lower:
   * total Search calls = queries x pages, and GitHub allows only 30 per
   * minute, so e.g. 7 topics x 3 pages = 21 calls (~45s paced) instead
   * of 70. Applies to this route's named `filters` too.
   */
  maxPagesPerQuery?: number;
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

export interface ScanCatalogOptions {
  /** Pages of 100 to walk per query (default: GitHub's max of 10). */
  maxPagesPerQuery?: number;
  /** See `CatalogSearchOptions.maxRateLimitWaitSeconds` — default 0 (never wait). */
  maxRateLimitWaitSeconds?: number;
}

export interface ScanCatalogResult {
  /** De-duplicated, stars-descending catalog rows. */
  items: CatalogSummary[];
  /**
   * False if any query failed or the scan stopped early on a GitHub rate
   * limit — i.e. `items` may be missing part of the population. Callers
   * that already hold a fuller cached catalog use this to avoid replacing
   * it with a smaller one.
   */
  complete: boolean;
}

/**
 * Runs each of `queries` as its own independent `searchOpenSourceCatalog`
 * scan and merges the results into one de-duplicated, stars-sorted list
 * of `CatalogSummary` rows. This is the OR-across-qualifiers workaround
 * `CatalogFilterConfig`'s doc comment describes: GitHub Search can't OR
 * multiple `topic:` qualifiers in a single query, so a catalog that's
 * conceptually "topic A OR topic B OR topic C" has to be built from
 * separate per-topic searches instead, unioned here.
 *
 * De-duplicates by `full_name` (a repo can legitimately match more than
 * one query, e.g. a repo tagged both `topic:cli` and `topic:devtools`)
 * — kept once, sorted by star count descending.
 *
 * Resilient by design: one query failing (or GitHub's rate limit being
 * hit) does NOT discard what the other queries already returned — that
 * all-or-nothing behavior is what previously left the tools catalog
 * permanently uncached. It only throws if *nothing* could be gathered
 * and at least one query errored, so a genuinely broken token or outage
 * still surfaces as an error instead of an empty catalog.
 */
export async function scanCatalog(
  env: ValidatedEnv,
  queries: string[],
  options: ScanCatalogOptions = {},
): Promise<ScanCatalogResult> {
  const byFullName = new Map<string, CatalogSummary>();
  let lastError: unknown = null;
  let failedQueries = 0;
  let rateLimited = false;

  for (const query of queries) {
    try {
      const result = await searchOpenSourceCatalog(env, query, {
        maxPages: options.maxPagesPerQuery,
        maxRateLimitWaitSeconds: options.maxRateLimitWaitSeconds,
      });

      for (const item of result.items) {
        const summary = toSummary(item);
        const existing = byFullName.get(summary.repositoryFullName);
        if (!existing || summary.stars > existing.stars) {
          byFullName.set(summary.repositoryFullName, summary);
        }
      }

      if (result.rateLimited) {
        // The remaining queries would just hit the same wall.
        rateLimited = true;
        break;
      }
    } catch (err) {
      failedQueries += 1;
      lastError = err;
      logger.error("catalog_scan_query_failed", {
        query,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (byFullName.size === 0 && lastError !== null) {
    throw lastError;
  }

  const items = Array.from(byFullName.values()).sort((a, b) => b.stars - a.stars);
  const complete = !rateLimited && failedQueries === 0;

  logger.info("catalog_scan_completed", {
    queries: queries.length,
    failedQueries,
    rateLimited,
    complete,
    repositories: items.length,
    maxPagesPerQuery: options.maxPagesPerQuery ?? DEFAULT_MAX_PAGES_PER_QUERY,
  });

  return { items, complete };
}

/**
 * Cold cache, nothing to serve stale: build a small catalog right now
 * (one page per query) so the very first visitor after a deploy or a long
 * warmer outage sees real data instead of an error. Guarded by the shared
 * scan lock — if another scan is already running, this re-checks the cache
 * once and otherwise reports `"busy"` (the route turns that into a 503
 * with `Retry-After`) rather than adding a second scan to the same GitHub
 * budget.
 */
async function buildCatalogOnColdStart(
  env: ValidatedEnv,
  workerEnv: Env,
  slot: string,
  queries: string[],
): Promise<CatalogSummary[] | "busy"> {
  const locked = await tryAcquireLock(workerEnv, SCAN_LOCK_NAME, SCAN_LOCK_TTL_SECONDS);

  if (!locked) {
    const again = await getCachedSWR<CatalogSummary[]>(workerEnv, slot, CATALOG_CACHE_SOFT_TTL_SECONDS);
    return again.status === "miss" ? "busy" : again.value;
  }

  try {
    const scan = await scanCatalog(env, queries, {
      maxPagesPerQuery: COLD_START_MAX_PAGES_PER_QUERY,
    });
    if (scan.items.length > 0) {
      await setCachedSWR(workerEnv, slot, scan.items, CATALOG_CACHE_HARD_TTL_SECONDS);
    }
    return scan.items;
  } finally {
    await releaseLock(workerEnv, SCAN_LOCK_NAME);
  }
}

/**
 * `POST` handler for a catalog's "Refresh" button
 * (`RefreshCatalogButton`, devtunnel-frontend `components/github-projects/`)
 * — validates `?filter=` exactly like `handleCatalogListRequest`, rate
 * limits per signed-in user (a tighter bucket than the list route, since
 * this can trigger a real GitHub scan), and calls `forceRefreshCatalog`.
 * Shared by both `POST /github-projects/refresh` and
 * `POST /github-open-source-tools/refresh` so the rate-limit bucket
 * naming, validation, and response shape only exist once.
 */
export async function handleCatalogRefreshRequest(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  config: CatalogRouteConfig,
) {
  const env: ValidatedEnv = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  // A real GitHub scan, not a cheap KV read — a noticeably tighter budget
  // than `${config.name}-list`'s 60/minute. `forceRefreshCatalog`'s own
  // `MANUAL_REFRESH_MIN_INTERVAL_SECONDS` guard already protects the
  // shared GITHUB_DISCOVERY_TOKEN budget across *every* contributor; this
  // just stops one contributor from hammering the endpoint itself.
  const withinLimit = await checkRateLimit(c, {
    bucket: `${config.name}-refresh`,
    limit: 5,
    windowSeconds: 300,
    identity: `user:${user.id}`,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many refresh requests. Try again shortly.");
  }

  const parsed = z.object({ filter: z.string().optional() }).safeParse({
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

  let discoveryQueries = config.discoveryQueries;
  let cacheSlot = config.cacheKey;
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
    cacheSlot = filterConfig.cacheKey;
  }

  try {
    const result = await forceRefreshCatalog(env, c.env, cacheSlot, discoveryQueries);

    if (result.status === "busy") {
      c.header("Retry-After", "15");
      return errorResponse(
        c,
        409,
        "catalog_refresh_in_progress",
        "A refresh is already in progress. Try again shortly.",
      );
    }

    if (result.status === "no-data") {
      return errorResponse(
        c,
        502,
        "github_unavailable",
        "Couldn't reach GitHub to refresh this catalog right now",
      );
    }

    return c.json(
      {
        status: result.status,
        repositoryCount: result.repositoryCount,
      },
      200,
    );
  } catch (err) {
    logger.error(`${config.name}_refresh_failed`, {
      error: err instanceof Error ? err.message : String(err),
      filter: parsed.data.filter ?? null,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't refresh this catalog right now");
  }
}

/**
 * Handles one `GET` request for a GitHub-wide catalog route: rate limit,
 * validate `limit`/`before`, read the cached catalog, paginate it in
 * memory, respond. Shared by every route built with this module so a fix
 * or tuning change (cache TTL, pagination semantics, error shape) only
 * has to happen once.
 *
 * Cache behavior:
 *  - fresh entry: served as-is.
 *  - stale entry (older than the soft TTL, still within the hard TTL):
 *    served immediately and logged as `catalog_served_stale` so a failing
 *    warmer is visible. No refresh is started from here — an HTTP
 *    request's background work is cut off ~30s after the response, far
 *    too short for a full paced scan, and every stale request kicking off
 *    its own scan just stampeded GitHub's rate limit.
 *  - miss: one quick cold-start scan (see `buildCatalogOnColdStart`).
 */
export async function handleCatalogListRequest(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  config: CatalogRouteConfig,
) {
  const env: ValidatedEnv = getEnv(c.env);

  // Counted per signed-in user, not per IP: this route is called
  // server-side by the Next.js frontend Worker, so an IP-based bucket
  // would be shared by every visitor and one page load could exhaust it
  // for everyone (see `RateLimitOptions.identity`).
  const user = c.get("user");
  const withinLimit = await checkRateLimit(c, {
    bucket: `${config.name}-list`,
    limit: LIST_RATE_LIMIT_PER_MINUTE,
    windowSeconds: 60,
    identity: user ? `user:${user.id}` : undefined,
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
  let cacheSlot = config.cacheKey;
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
    cacheSlot = filterConfig.cacheKey;
  }

  try {
    const cached = await getCachedSWR<CatalogSummary[]>(
      c.env,
      cacheSlot,
      CATALOG_CACHE_SOFT_TTL_SECONDS,
    );

    let catalog: CatalogSummary[];

    if (cached.status !== "miss") {
      catalog = cached.value;
      if (cached.status === "stale") {
        logger.warn("catalog_served_stale", {
          catalog: config.name,
          slot: cacheSlot,
          filter: parsed.data.filter ?? null,
        });
      }
    } else {
      const built = await buildCatalogOnColdStart(env, c.env, cacheSlot, discoveryQueries);
      if (built === "busy") {
        c.header("Retry-After", "15");
        return errorResponse(
          c,
          503,
          "catalog_warming",
          "This catalog is still being built. Try again shortly.",
        );
      }
      // Empty only if GitHub genuinely returned nothing right now —
      // treated as an empty catalog, not an error.
      catalog = built;
    }

    const { limit, before } = parsed.data;
    const startIndex = before ? Number(before) : 0;
    const page = catalog.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < catalog.length;

    if (hasMore) {
      c.header("X-Next-Cursor", String(startIndex + limit));
    }

    // Already `CatalogSummary` rows — `toSummary` ran at scan time.
    return c.json(page, 200);
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
 * warmer (`lib/cacheWarmers.ts`), never by a request handler.
 *
 * Takes the shared scan lock (skips this slot if another scan holds it),
 * runs a full paced scan that's allowed to sit out one GitHub rate-limit
 * window, and — if the scan came back incomplete — refuses to replace an
 * existing cached catalog with a smaller one. Errors are caught and
 * logged, never thrown: a warmer run is best-effort, and the next
 * scheduled run tries again while readers keep serving what's in KV.
 */
export async function warmCatalogCacheKey(
  env: ValidatedEnv,
  workerEnv: Env,
  cacheKey: string,
  discoveryQueries: string[],
  maxPagesPerQuery: number = DEFAULT_MAX_PAGES_PER_QUERY,
): Promise<void> {
  const locked = await tryAcquireLock(workerEnv, SCAN_LOCK_NAME, SCAN_LOCK_TTL_SECONDS);
  if (!locked) {
    logger.info("catalog_warm_skipped_locked", { slot: cacheKey });
    return;
  }

  try {
    const scan = await scanCatalog(env, discoveryQueries, {
      maxPagesPerQuery,
      maxRateLimitWaitSeconds: WARM_MAX_RATE_LIMIT_WAIT_SECONDS,
    });

    if (scan.items.length === 0) {
      logger.warn("catalog_warm_produced_nothing", { slot: cacheKey });
      return;
    }

    if (!scan.complete) {
      const existing = await getCachedSWR<CatalogSummary[]>(
        workerEnv,
        cacheKey,
        CATALOG_CACHE_SOFT_TTL_SECONDS,
      );
      if (existing.status !== "miss" && existing.value.length >= scan.items.length) {
        logger.warn("catalog_warm_kept_existing", {
          slot: cacheKey,
          existingRepositories: existing.value.length,
          partialRepositories: scan.items.length,
        });
        return;
      }
    }

    await setCachedSWR(workerEnv, cacheKey, scan.items, CATALOG_CACHE_HARD_TTL_SECONDS);
    logger.info("catalog_warm_stored", {
      slot: cacheKey,
      repositories: scan.items.length,
      complete: scan.complete,
    });
  } catch (err) {
    logger.error("catalog_warm_failed", {
      slot: cacheKey,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    await releaseLock(workerEnv, SCAN_LOCK_NAME);
  }
}

/**
 * Warms every cache slot a `CatalogRouteConfig` can ever serve — its base
 * catalog plus every named filter — so the scheduled warmer only needs one
 * call per route (`lib/cacheWarmers.ts`) regardless of how many filters
 * that route declares. Slots are warmed one after another (never in
 * parallel): they all spend the same GitHub Search budget.
 */
export async function warmCatalogRoute(
  env: ValidatedEnv,
  workerEnv: Env,
  config: CatalogRouteConfig,
): Promise<void> {
  const maxPages = config.maxPagesPerQuery ?? DEFAULT_MAX_PAGES_PER_QUERY;

  await warmCatalogCacheKey(env, workerEnv, config.cacheKey, config.discoveryQueries, maxPages);

  for (const filterConfig of Object.values(config.filters ?? {})) {
    await warmCatalogCacheKey(
      env,
      workerEnv,
      filterConfig.cacheKey,
      filterConfig.discoveryQueries,
      maxPages,
    );
  }
}

// ---------------------------------------------------------------------------
// Manual, contributor-triggered refresh ("Refresh" button on /github-projects
// and /github-open-source-tools)
//
// Everything above this point deliberately keeps a full, deep re-scan
// (`warmCatalogRoute`/`warmCatalogCacheKey`, up to `DEFAULT_MAX_PAGES_PER_QUERY`
// pages per query) off the request path — that's the whole point of
// `handleCatalogListRequest`'s doc comment: "Request handlers never start a
// full scan themselves." A manual refresh has to respect that same budget
// constraint, so it reuses the same *shallow* scan the cold-start path
// already runs (`COLD_START_MAX_PAGES_PER_QUERY` — one page per query,
// ~7-21 GitHub Search calls depending on the catalog, a few seconds paced)
// rather than the warmer's deep one. That's a deliberate trade: a manual
// refresh trades completeness for staying inside one HTTP request's
// lifetime, same as the very first visitor after a deploy already gets.
// ---------------------------------------------------------------------------

/**
 * A manual refresh this recently is treated as "already up to date" rather
 * than spending another round of GitHub Search calls — protects the shared
 * `GITHUB_DISCOVERY_TOKEN` budget from repeated clicks (by one contributor,
 * or several different ones in close succession) without needing a second,
 * separate cooldown mechanism beyond the cache itself.
 */
const MANUAL_REFRESH_MIN_INTERVAL_SECONDS = 60;

export type ForceRefreshCatalogResult =
  | { status: "refreshed"; repositoryCount: number }
  /** Already refreshed inside `MANUAL_REFRESH_MIN_INTERVAL_SECONDS` — nothing re-scanned. */
  | { status: "already-fresh"; repositoryCount: number }
  /** Another scan (the scheduled warmer, or someone else's refresh) is in progress right now. */
  | { status: "busy" }
  /** The scan ran but GitHub returned nothing usable — the existing cached catalog, if any, is left untouched. */
  | { status: "no-data" };

/**
 * The `POST .../refresh` handlers' actual work: re-scan one catalog slot
 * right now, at cold-start depth, and replace its cached entry — so the
 * very next `GET` (the frontend's own re-fetch after a successful refresh)
 * serves the new data instead of waiting up to `CATALOG_CACHE_SOFT_TTL_SECONDS`
 * for the scheduled warmer.
 *
 * Guarded two ways against hammering GitHub's Search budget:
 *  - `MANUAL_REFRESH_MIN_INTERVAL_SECONDS`: a cache entry younger than that
 *    is reported `"already-fresh"` without re-scanning at all.
 *  - The shared `SCAN_LOCK_NAME` lock (same one `buildCatalogOnColdStart`
 *    and the warmer use): if another scan already holds it, this reports
 *    `"busy"` immediately rather than queuing behind it — the caller's own
 *    per-user rate limit plus this lock together mean at most one scan for
 *    this slot runs at a time, from any source.
 */
export async function forceRefreshCatalog(
  env: ValidatedEnv,
  workerEnv: Env,
  cacheSlot: string,
  discoveryQueries: string[],
): Promise<ForceRefreshCatalogResult> {
  const recent = await getCachedSWR<CatalogSummary[]>(
    workerEnv,
    cacheSlot,
    MANUAL_REFRESH_MIN_INTERVAL_SECONDS,
  );
  if (recent.status === "fresh") {
    return { status: "already-fresh", repositoryCount: recent.value.length };
  }

  const locked = await tryAcquireLock(workerEnv, SCAN_LOCK_NAME, SCAN_LOCK_TTL_SECONDS);
  if (!locked) {
    return { status: "busy" };
  }

  try {
    const scan = await scanCatalog(env, discoveryQueries, {
      maxPagesPerQuery: COLD_START_MAX_PAGES_PER_QUERY,
    });

    if (scan.items.length === 0) {
      logger.warn("catalog_manual_refresh_produced_nothing", { slot: cacheSlot });
      return { status: "no-data" };
    }

    await setCachedSWR(workerEnv, cacheSlot, scan.items, CATALOG_CACHE_HARD_TTL_SECONDS);
    logger.info("catalog_manual_refresh_stored", {
      slot: cacheSlot,
      repositories: scan.items.length,
      complete: scan.complete,
    });
    return { status: "refreshed", repositoryCount: scan.items.length };
  } finally {
    await releaseLock(workerEnv, SCAN_LOCK_NAME);
  }
}