import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { getCached, setCached } from "../lib/cache";
import {
  getCoveredIssueNumbersByProject,
  getIgnoredIssueKeysByProject,
  ignoredIssueKey,
  listActiveProjectsWithRepo,
} from "../db/adminNewIssues";
import { getValidGithubAccessToken } from "../db/githubTokens";
import { fetchAllRepositoryIssues } from "../lib/githubRepo";
import {
  GITHUB_SCAN_CACHE_KEY,
  GITHUB_SCAN_CACHE_TTL_SECONDS,
  toScanIssue,
  type GithubScanCacheEntry,
  type NewIssueScanIssue,
} from "./admin/newIssues";

/**
 * Contributor — All Issues (`/issues` — "All Issues" in
 * `AppSidebar` / `AppBottomNav`, devtunnel-frontend's
 * `lib/issues/{types,api}.ts`). Mounted directly on the app root in
 * src/index.ts (`app.route("/", issues)`) — unlike `/admin/new-issues`,
 * this is reachable by any signed-in contributor, not just admins.
 *
 * This is the contributor-facing sibling of
 * `GET /admin/new-issues` (src/routes/admin/newIssues.ts): same
 * detection algorithm (every open GitHub issue across active projects,
 * minus anything already covered by a live DevTunnel task), same live
 * cross-project GitHub scan, and — deliberately — the exact same
 * `GITHUB_SCAN_CACHE_KEY` cache entry, so a contributor loading this page
 * within the same 5-minute window as an admin (or another contributor)
 * shares that scan instead of paying for a second independent one. See
 * that file's own doc comment for the full reasoning on why the scan is
 * cached but the diff against `tasks`/`ignored_github_issues` is not.
 *
 * Two differences from the admin route, both deliberate:
 *  - `requireAuth` only — no `requireAdminRole` / `requirePermission`.
 *    Browsing open issues to find something to work on is not an admin
 *    action; only *curating* DevTunnel's task list (creating a task from
 *    an issue, ignoring one) is, and neither of those actions exists on
 *    this route.
 *  - Issues an admin has explicitly ignored (`ignored_github_issues`,
 *    sql/014) are excluded here too, not just issues already covered by
 *    a task. An admin ignoring an issue is a judgment call that it isn't
 *    worth turning into DevTunnel work right now — surfacing it to
 *    contributors as something to pick up would undercut that judgment,
 *    so this treats "covered" and "ignored" the same way admin's own UI
 *    already effectively treats them (both make an issue disappear from
 *    the actionable list).
 *
 * Response shape is the trimmed `Issue[]` (devtunnel-frontend's
 * `lib/issues/types.ts`) — the same fields as `AdminNewIssue` minus `id`
 * (a `{projectId}:{issueNumber}` curation-record key with nothing to key
 * here — no ignore/convert-to-task action exists on this route) and
 * minus `project.id` / `project.onboardedAt` (a contributor browsing
 * issues has no use for either). Returned as a raw array, not the
 * `{ data: ... }` envelope — same documented exception every other list
 * route in this backend uses (see `GET /admin/new-issues`).
 */
export const issues = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Query validation for `GET /issues` — same shape, bounds, and reasoning
 * as `listQuerySchema` in src/routes/admin/newIssues.ts (`limit` capped
 * at 1000 since there's no database table to page through here either —
 * every call recomputes its result from the same live/cached GitHub
 * scan). No `refresh` param: forcing a bypass of the shared scan cache is
 * an admin-only affordance (`SyncAllIssuesButton`) — a contributor
 * forcing a fresh cross-project GitHub re-scan on every page load would
 * undermine the exact cost-sharing this cache exists for, with no
 * curation action on this page that a stale-by-at-most-5-minutes read
 * would actually block.
 */
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).optional().default(50),
  before: z.string().datetime({ offset: true }).optional(),
});

/**
 * `GET /issues` — every open GitHub issue across DevTunnel's active
 * projects that isn't already covered by a task or explicitly ignored by
 * an admin, sorted newest-updated-first, keyset-paginated exactly like
 * `GET /admin/new-issues` (`limit`/`before` query params, `X-Next-Cursor`
 * response header). See this file's own doc comment above for the full
 * reasoning on caching, scope, and why this differs from that admin
 * route.
 */
issues.get("/issues", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    // requireAuth already guarantees this — kept for type safety, same
    // pattern used throughout this backend's protected routes.
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  // Same cost profile as `GET /admin/new-issues` on a cache miss (a live
  // cross-project GitHub scan) — rate limited the same way (rule 42:
  // protect expensive endpoints), in its own bucket so contributor
  // traffic here can never exhaust the admin route's budget or vice
  // versa.
  const withinLimit = await checkRateLimit(c, {
    bucket: "issues-list",
    limit: 20,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsed = listQuerySchema.safeParse({
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
    const supabase = getSupabase(env);

    const projects = await listActiveProjectsWithRepo(supabase);
    if (projects.length === 0) {
      return c.json([], 200);
    }

    const projectIds = projects.map(({ project }) => project.id);

    const [coveredByProject, ignoredKeys] = await Promise.all([
      getCoveredIssueNumbersByProject(supabase, projectIds),
      getIgnoredIssueKeysByProject(supabase, projectIds),
    ]);

    // Same cache-first strategy as `GET /admin/new-issues`, reading the
    // exact same `GITHUB_SCAN_CACHE_KEY` entry that route writes (and
    // this route also writes, on its own cache miss) — see this file's
    // doc comment for why sharing one cache entry across both routes
    // matters.
    const cached = await getCached<GithubScanCacheEntry>(c.env, GITHUB_SCAN_CACHE_KEY);
    const cachedByProjectId = new Map((cached?.projects ?? []).map((p) => [p.projectId, p.issues]));
    const cacheIsUsable = cached !== null && projectIds.every((id) => cachedByProjectId.has(id));

    let rawIssuesByProjectId: Map<string, NewIssueScanIssue[]>;

    if (cacheIsUsable) {
      rawIssuesByProjectId = cachedByProjectId;
    } else {
      // Cache miss, expired, or stale (a project onboarded since the
      // cache was last written) — fall back to a real live
      // cross-project GitHub scan, same as the admin route's own
      // fallback.
      const accessToken = await getValidGithubAccessToken(supabase, env, user.id);

      const perProjectResults = await Promise.allSettled(
        projects.map(async ({ project, owner, repo }) => ({
          projectId: project.id,
          issues: (await fetchAllRepositoryIssues(accessToken, owner, repo)).map(toScanIssue),
        })),
      );

      rawIssuesByProjectId = new Map();
      const scannedForCache: GithubScanCacheEntry["projects"] = [];
      perProjectResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          rawIssuesByProjectId.set(result.value.projectId, result.value.issues);
          scannedForCache.push(result.value);
          return;
        }
        const { project } = projects[index]!;
        logger.error("issues_project_scan_failed", {
          projectId: project.id,
          repositoryFullName: project.repositoryFullName,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          requestId: c.get("requestId"),
        });
      });

      // Only cache what actually succeeded — same rule 21 reasoning as
      // the admin route. Written to the *shared* key, so an admin's next
      // request (or another contributor's) benefits from this scan too.
      if (scannedForCache.length > 0) {
        await setCached(
          c.env,
          GITHUB_SCAN_CACHE_KEY,
          { scannedAt: new Date().toISOString(), projects: scannedForCache } satisfies GithubScanCacheEntry,
          GITHUB_SCAN_CACHE_TTL_SECONDS,
        );
      }
    }

    const openIssues: Array<{
      number: number;
      title: string;
      url: string;
      state: NewIssueScanIssue["state"];
      project: (typeof projects)[number]["project"];
      author: NewIssueScanIssue["author"];
      labels: string[];
      createdAt: string;
      updatedAt: string;
    }> = [];

    for (const { project } of projects) {
      const projectIssues = rawIssuesByProjectId.get(project.id);
      if (!projectIssues) continue; // this project's scan failed and isn't cached — contributes nothing this time

      const coveredNumbers = coveredByProject.get(project.id) ?? new Set<number>();
      for (const issue of projectIssues) {
        if (coveredNumbers.has(issue.number)) continue;
        if (ignoredKeys.has(ignoredIssueKey(project.id, issue.number))) continue;

        openIssues.push({
          number: issue.number,
          title: issue.title,
          url: issue.url,
          state: issue.state,
          project,
          author: issue.author,
          labels: issue.labels,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
        });
      }
    }

    // Newest-updated-first across every project — same ordering as
    // `GET /admin/new-issues`; pagination below depends on this already
    // being in strict `updatedAt desc` order.
    openIssues.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : a.updatedAt < b.updatedAt ? 1 : 0));

    // In-memory keyset pagination, identical semantics to
    // `GET /admin/new-issues` — see that route's doc comment for why
    // this can't be pushed into the GitHub scan/database layer.
    const { limit, before } = parsed.data;
    const afterCursor = before ? openIssues.filter((issue) => issue.updatedAt < before) : openIssues;
    const hasMore = afterCursor.length > limit;
    const page = hasMore ? afterCursor.slice(0, limit) : afterCursor;

    if (hasMore) {
      c.header("X-Next-Cursor", page[page.length - 1]!.updatedAt);
    }

    // Trim each project ref to what `IssueProjectRef` (frontend) needs —
    // no `id` (nothing on this route keys off it) and no `onboardedAt`
    // (irrelevant to a contributor browsing issues).
    const response = page.map((issue) => ({
      number: issue.number,
      title: issue.title,
      url: issue.url,
      state: issue.state,
      project: {
        slug: issue.project.slug,
        name: issue.project.name,
        repositoryFullName: issue.project.repositoryFullName,
        repositoryUrl: issue.project.repositoryUrl,
        techStack: issue.project.techStack,
      },
      author: issue.author,
      labels: issue.labels,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
    }));

    return c.json(response, 200);
  } catch (err) {
    logger.error("issues_list_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load issues right now");
  }
});