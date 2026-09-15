import type { ActiveProjectWithRepo } from "../db/adminNewIssues";
import { logger } from "./logger";
import { fetchAllRepositoryIssues } from "./githubRepo";
import { toScanIssue, type GithubScanCacheEntry, type NewIssueScanIssue } from "../routes/admin/newIssues";

/**
 * The live cross-project GitHub issue scan shared by `GET /issues`
 * (src/routes/issues.ts) and its scheduled cache warmer
 * (`lib/cacheWarmers.ts`) — pulled out here so both call sites run exactly
 * one copy of this logic (rule 51) instead of the route re-implementing it
 * inline a second time. `GET /admin/new-issues` (src/routes/admin/newIssues.ts)
 * keeps its own independent copy deliberately (see that route's own doc
 * comment on why it uses a different cache key/TTL than the contributor
 * route now does) — this module exists for the contributor-facing side
 * only.
 *
 * `accessToken` is deliberately just `string | null`, the same shape
 * `fetchAllRepositoryIssues` already accepts, rather than anything tied to
 * a signed-in user:
 *  - A real request's cache-miss path passes the requesting contributor's
 *    own GitHub access token (`getValidGithubAccessToken`) — same as
 *    before this was extracted.
 *  - The scheduled warmer has no signed-in user at all (it runs on a cron,
 *    not behind a request), so it passes `GITHUB_DISCOVERY_TOKEN` instead —
 *    the same backend-controlled token `lib/githubCatalog.ts` already uses
 *    for its own server-initiated GitHub calls.
 * Both produce the same `GithubScanCacheEntry` shape either way.
 */
export async function scanProjectIssues(
  accessToken: string | null,
  projects: ActiveProjectWithRepo[],
  onProjectFailed?: (project: ActiveProjectWithRepo["project"], error: unknown) => void,
): Promise<GithubScanCacheEntry["projects"]> {
  const perProjectResults = await Promise.allSettled(
    projects.map(async ({ project, owner, repo }) => ({
      projectId: project.id,
      issues: (await fetchAllRepositoryIssues(accessToken, owner, repo)).map(toScanIssue),
    })),
  );

  const scanned: GithubScanCacheEntry["projects"] = [];

  perProjectResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      scanned.push(result.value);
      return;
    }
    const { project } = projects[index]!;
    if (onProjectFailed) {
      onProjectFailed(project, result.reason);
    } else {
      logger.error("issues_project_scan_failed", {
        projectId: project.id,
        repositoryFullName: project.repositoryFullName,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  return scanned;
}

export type { NewIssueScanIssue };