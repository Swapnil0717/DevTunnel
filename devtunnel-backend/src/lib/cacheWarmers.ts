import type { Env } from "../types";
import type { ValidatedEnv } from "../config/env";
import { logger } from "./logger";
import { getSupabase } from "./supabase";
import { warmCacheSWR } from "./cache";
import { warmCatalogRoute } from "./githubCatalog";
import { scanProjectIssues } from "./issuesScan";
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
 * Re-scans and re-caches the contributor-facing `/issues` scan
 * (`ISSUES_SCAN_CACHE_KEY`, distinct from `GET /admin/new-issues`'s own
 * cache entry — see routes/issues.ts's doc comment). Uses
 * `GITHUB_DISCOVERY_TOKEN` — the same backend-controlled PAT
 * `lib/githubCatalog.ts` already uses for its own server-initiated GitHub
 * calls — rather than any individual contributor's OAuth token, since a
 * scheduled job has no signed-in user to borrow one from.
 */
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

  await warmCacheSWR<GithubScanCacheEntry>(
    workerEnv,
    ISSUES_SCAN_CACHE_KEY,
    ISSUES_SCAN_HARD_TTL_SECONDS,
    async () => {
      const scanned = await scanProjectIssues(env.GITHUB_DISCOVERY_TOKEN, projects, (project, error) => {
        logger.error("issues_project_scan_failed", {
          projectId: project.id,
          repositoryFullName: project.repositoryFullName,
          error: error instanceof Error ? error.message : String(error),
          source: "scheduled_warmer",
        });
      });
      return scanned.length > 0
        ? ({ scannedAt: new Date().toISOString(), projects: scanned } satisfies GithubScanCacheEntry)
        : null;
    },
  );

  logger.info("issues_warm_completed", { projectCount: projects.length });
}