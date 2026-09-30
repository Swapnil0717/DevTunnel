import type { Env } from "../types";
import type { ValidatedEnv } from "../config/env";
import { logger } from "./logger";
import { getSupabase } from "./supabase";
import { warmCacheSWR, getCachedSWR } from "./cache";
import { warmCatalogRoute, warmRotatingCatalogFilter } from "./githubCatalog";
import { scanProjectIssues, ISSUES_SCAN_BATCH_SIZE } from "./issuesScan";
import { listActiveProjectsWithRepo, type ActiveProjectWithRepo } from "../db/adminNewIssues";
import type { GithubScanCacheEntry } from "../routes/admin/newIssues";
import {
  ISSUES_SCAN_CACHE_KEY,
  ISSUES_SCAN_HARD_TTL_SECONDS,
} from "../routes/issues";
import { CATALOG_CONFIG as GITHUB_PROJECTS_CATALOG } from "../routes/githubProjects";
import { CATALOG_CONFIG as GITHUB_OPEN_SOURCE_TOOLS_CATALOG } from "../routes/githubOpenSourceTools";

/**
 * Background jobs that keep the three cache entries behind `GET
 * /github-projects`, `GET /github-open-source-tools`, and `GET /issues`
 * warm — invoked from `src/index.ts`'s `scheduled` handler on a cron, never
 * from a request handler.
 *
 * Why this exists: `withCacheSWR` (lib/cache.ts) already means no single
 * user request is ever forced to wait on a live GitHub scan once a cache
 * entry exists (a stale entry is served immediately while refreshing in
 * the background). But *something* still has to produce the very first
 * entry, and keep producing fresh ones often enough that requests mostly
 * see "fresh", not "stale". These warmers are that something — they run on
 * a schedule tighter than each cache's soft TTL, so in steady state real
 * contributor/admin traffic essentially never triggers a live scan itself.
 *
 * Each warmer is independent and best-effort (errors are caught and
 * logged, never thrown) — one catalog's scan failing must never prevent
 * the issues scan (or the other catalog) from still running.
 */

/**
 * Re-scans and re-caches both GitHub-wide catalogs — `/github-projects`
 * and `/github-open-source-tools` (base catalog plus every named filter,
 * e.g. `?filter=alternative-to-paid`) — reusing each route's own
 * `CATALOG_CONFIG` as the single source of truth for discovery
 * queries/cache keys, so this never drifts out of sync with what the
 * routes themselves actually serve.
 *
 * Runs the catalogs strictly one after another, NOT in parallel: they all
 * spend the same `GITHUB_DISCOVERY_TOKEN`, and GitHub's Search API allows
 * only 30 requests per minute per token. Running them concurrently (as
 * this used to) meant the two scans' calls stacked up and both hit the
 * limit. `lib/githubDiscovery.ts` paces every Search call at ~1 per 2.1s,
 * so the whole run (roughly 50 calls) takes a couple of minutes — fine
 * for a background job on a 25-minute cadence.
 */
export async function warmGithubCatalogs(env: ValidatedEnv, workerEnv: Env): Promise<void> {
  const catalogs = [GITHUB_PROJECTS_CATALOG, GITHUB_OPEN_SOURCE_TOOLS_CATALOG];

  for (const catalog of catalogs) {
    try {
      await warmCatalogRoute(env, workerEnv, catalog);
    } catch (err) {
      logger.error("catalog_warm_failed", {
        catalog: catalog.name,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("catalog_warm_completed", {
    catalogs: catalogs.map((catalog) => catalog.name),
  });
}

/**
 * One star-range bucket of `/github-projects` per call (see
 * `warmRotatingCatalogFilter`). Own cron, so it gets its own 50-subrequest
 * budget instead of competing with `warmGithubCatalogs`.
 */
/** One rotation step per hourly run — must equal the cron interval (`"12 * * * *"`) or buckets get skipped. */
const STAR_BUCKET_TICK_MS = 60 * 60 * 1000;

export async function warmGithubStarBuckets(env: ValidatedEnv, workerEnv: Env): Promise<void> {
  try {
    await warmRotatingCatalogFilter(
      env,
      workerEnv,
      GITHUB_PROJECTS_CATALOG,
      Math.floor(Date.now() / STAR_BUCKET_TICK_MS),
    );
  } catch (err) {
    logger.error("catalog_star_bucket_warm_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Re-scans and re-caches the contributor-facing `/issues` scan
 * (`ISSUES_SCAN_CACHE_KEY`, distinct from `GET /admin/new-issues`'s own
 * cache entry — see routes/issues.ts's doc comment). Uses
 * `GITHUB_DISCOVERY_TOKEN` — the same backend-controlled PAT
 * `lib/githubCatalog.ts` already uses for its own server-initiated GitHub
 * calls — rather than any individual contributor's OAuth token, since a
 * scheduled job has no signed-in user to borrow one from.
 *
 * Scans a rotating batch of `ISSUES_SCAN_BATCH_SIZE` projects per tick
 * instead of every active project at once. `fetchAllRepositoryIssues`
 * walks every page of a repo's open-issue backlog, so scanning every
 * onboarded project in a single invocation could add up to well more than
 * Workers Free's 50-external-subrequest-per-invocation cap (and blew the
 * 10ms CPU cap alongside it) once there were more than a handful of
 * projects — surfaced as `Too many subrequests by single Worker
 * invocation` / `Exceeded CPU Limit` in `wrangler tail`. Each tick now
 * merges its batch's fresh results into whatever the previous tick(s)
 * cached for every other project, so the full set still cycles through
 * every `ceil(projectCount / ISSUES_SCAN_BATCH_SIZE)` ticks (well within
 * `ISSUES_SCAN_HARD_TTL_SECONDS`) without any single invocation scanning
 * more than a few repos. `ISSUES_SCAN_BATCH_SIZE` itself now lives in
 * `lib/issuesScan.ts` so `routes/issues.ts`'s live cache-miss fallback can
 * share the exact same cap instead of redeclaring its own (see that
 * route's `missingProjects` handling).
 */
/**
 * Rotation position comes from the clock, not from KV: `tick = floor(now /
 * ISSUES_SCAN_TICK_MS)`, and this run's batch starts at `tick * batchSize`.
 * The old version kept a cursor in KV (`issues-scan-cursor`), which cost one
 * KV write on every run (~360/day at a 4-minute cadence) just to remember
 * where it was. Consecutive runs still get consecutive batches, so every
 * project is still visited every `ceil(projectCount / ISSUES_SCAN_BATCH_SIZE)`
 * runs; if the project count changes the rotation just shifts, which is
 * harmless.
 */
// Must equal the every-15-minutes cron interval in wrangler.toml so each run advances exactly one batch.
const ISSUES_SCAN_TICK_MS = 15 * 60 * 1000;

export async function warmContributorIssuesScan(env: ValidatedEnv, workerEnv: Env): Promise<void> {
  const supabase = getSupabase(env);

  let projects: ActiveProjectWithRepo[];
  try {
    projects = await listActiveProjectsWithRepo(supabase);
  } catch (err) {
    logger.error("issues_warm_failed", {
      stage: "load_projects",
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (projects.length === 0) {
    logger.info("issues_warm_skipped", { reason: "no_active_projects" });
    return;
  }

  const batchSize = Math.min(ISSUES_SCAN_BATCH_SIZE, projects.length);
  const tick = Math.floor(Date.now() / ISSUES_SCAN_TICK_MS);
  const startIndex = (tick * batchSize) % projects.length;
  const batch = Array.from(
    { length: batchSize },
    (_, i) => projects[(startIndex + i) % projects.length]!,
  );

  // Whatever's already cached for the projects *not* in this tick's batch —
  // read regardless of freshness, since a stale-but-present entry for an
  // untouched project is still far better than dropping it from the
  // response until its next turn in the rotation.
  const previous = await getCachedSWR<GithubScanCacheEntry>(
    workerEnv,
    ISSUES_SCAN_CACHE_KEY,
    Number.MAX_SAFE_INTEGER,
  );
  const previousProjects = previous.status !== "miss" ? previous.value.projects : [];

  await warmCacheSWR<GithubScanCacheEntry>(
    workerEnv,
    ISSUES_SCAN_CACHE_KEY,
    ISSUES_SCAN_HARD_TTL_SECONDS,
    async () => {
      const scanned = await scanProjectIssues(env.GITHUB_DISCOVERY_TOKEN, batch, (project, error) => {
        logger.error("issues_project_scan_failed", {
          projectId: project.id,
          repositoryFullName: project.repositoryFullName,
          error: error instanceof Error ? error.message : String(error),
          source: "scheduled_warmer",
        });
      });

      const scannedIds = new Set(batch.map(({ project }) => project.id));
      const merged = [
        ...previousProjects.filter((entry) => !scannedIds.has(entry.projectId)),
        ...scanned,
      ];

      return merged.length > 0
        ? ({ scannedAt: new Date().toISOString(), projects: merged } satisfies GithubScanCacheEntry)
        : null;
    },
  );

  logger.info("issues_warm_completed", { batchSize: batch.length, totalProjectCount: projects.length });
}