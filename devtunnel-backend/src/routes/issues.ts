import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { withCacheSWR } from "../lib/cache";
import { scanProjectIssues } from "../lib/issuesScan";
import {
  getCoveredIssueNumbersByProject,
  getIgnoredIssueKeysByProject,
  ignoredIssueKey,
  listActiveProjectsWithRepo,
} from "../db/adminNewIssues";
import { getValidGithubAccessToken } from "../db/githubTokens";
import type { GithubScanCacheEntry, NewIssueScanIssue } from "./admin/newIssues";

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
 * minus anything already covered by a live DevTunnel task or explicitly
 * ignored by an admin) and the same shape of live cross-project GitHub
 * scan (`lib/issuesScan.ts`, shared with that route).
 *
 * Unlike an earlier version of this route, this does **not** share
 * `GET /admin/new-issues`'s `GITHUB_SCAN_CACHE_KEY` / 5-minute cache
 * entry anymore. It now has its own `ISSUES_SCAN_CACHE_KEY`, read through
 * `withCacheSWR` (see `lib/cache.ts`) instead of a plain get/set:
 *  - This is by far the highest-traffic page of the two (every
 *    contributor, not just admins), so it gets a cadence tuned for that
 *    — see `ISSUES_SCAN_SOFT_TTL_SECONDS` below.
 *  - Splitting the key means a contributor's page load can never be the
 *    request that pays for a synchronous re-scan just because an admin's
 *    5-minute cache window happened to lapse (or vice versa) — each
 *    route's cache now lives and dies on its own schedule.
 *  - `withCacheSWR` means even *this* route's own cache misses stop
 *    blocking a real request in steady state: the scheduled warmer
 *    (`lib/cacheWarmers.ts`, cron in wrangler.toml) keeps this key
 *    refreshed in the background, so a contributor's request should
 *    almost always find a fresh-or-stale-but-present entry rather than a
 *    true miss.
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
 * KV key for this route's own SWR-managed scan cache — deliberately not
 * `GET /admin/new-issues`'s `GITHUB_SCAN_CACHE_KEY` (see this file's own
 * doc comment above for why the two routes no longer share one entry).
 */
export const ISSUES_SCAN_CACHE_KEY = "issues:github-scan:v2";

/**
 * 4 minutes: short enough that "All Issues" still feels current on any
 * normal contributor visit, comfortably under the ~4-5 minute cadence the
 * scheduled warmer (`lib/cacheWarmers.ts`) re-scans this key on, so in
 * steady state a contributor's request finds a *fresh* entry from the
 * warmer, not a stale one it has to wait out a background refresh for.
 */
export const ISSUES_SCAN_SOFT_TTL_SECONDS = 4 * 60;

/**
 * How long a scan result survives in KV as a stale-but-usable fallback —
 * comfortably longer than the soft TTL so a warmer outage of up to half an
 * hour still serves instantly (if slightly old) instead of falling through
 * to a synchronous live scan on some unlucky contributor's request.
 */
export const ISSUES_SCAN_HARD_TTL_SECONDS = 30 * 60;

/**
 * Query validation for `GET /issues` — same shape, bounds, and reasoning
 * as `listQuerySchema` in src/routes/admin/newIssues.ts (`limit` capped
 * at 1000 since there's no database table to page through here either —
 * every call recomputes its result from the same live/cached GitHub
 * scan). No `refresh` param: forcing a bypass of this route's own scan
 * cache is an admin-only affordance on the admin route
 * (`SyncAllIssuesButton`) — a contributor forcing a fresh cross-project
 * GitHub re-scan on every page load would undermine the exact cost-sharing
 * this cache exists for, with no curation action on this page that a
 * stale-by-a-few-minutes read would actually block.
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

  // Rate limited the same way `GET /admin/new-issues` is (rule 42: protect
  // expensive endpoints) — in its own bucket so contributor traffic here
  // can never exhaust the admin route's budget or vice versa. Note this
  // now mostly guards the *synchronous* cache-miss path: in steady state
  // with the scheduled warmer running, most requests here are cheap KV
  // reads, not live GitHub scans.
  //
  // Counted per signed-in user, not per connecting IP (the default): the
  // contributor's browser doesn't call this route for the first paint —
  // the Next.js frontend Worker does, server-side, on their behalf — so
  // every visitor's request arrives from the frontend's own address.
  // Keyed by IP, all contributors shared one 20-per-minute bucket and a
  // handful of people opening All Issues at once could lock everyone out
  // with a 429 (which the page rendered as "Issues aren't available").
  // See `RateLimitOptions.identity` in lib/rateLimit.ts.
  const withinLimit = await checkRateLimit(c, {
    bucket: "issues-list",
    limit: 20,
    windowSeconds: 60,
    identity: `user:${user.id}`,
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

    // Stale-while-revalidate read of this route's own scan cache (see
    // `ISSUES_SCAN_CACHE_KEY`'s doc comment above for why this is no
    // longer the same KV entry `GET /admin/new-issues` uses). A fresh or
    // stale cached entry is returned without ever blocking this request
    // on a live scan; only a true miss falls through to the synchronous
    // scan below, using *this* contributor's own GitHub access token —
    // exactly the pre-existing miss-path behavior, just reached through
    // `withCacheSWR` instead of a hand-rolled get/set.
    const scan = await withCacheSWR<GithubScanCacheEntry>(
      c.executionCtx,
      c.env,
      ISSUES_SCAN_CACHE_KEY,
      { softTtlSeconds: ISSUES_SCAN_SOFT_TTL_SECONDS, hardTtlSeconds: ISSUES_SCAN_HARD_TTL_SECONDS },
      async () => {
        const accessToken = await getValidGithubAccessToken(supabase, env, user.id);
        const scanned = await scanProjectIssues(accessToken, projects, (project, error) => {
          logger.error("issues_project_scan_failed", {
            projectId: project.id,
            repositoryFullName: project.repositoryFullName,
            error: error instanceof Error ? error.message : String(error),
            requestId: c.get("requestId"),
          });
        });
        // Only cache what actually succeeded (rule 21: never fake data
        // that wasn't really fetched).
        return scanned.length > 0
          ? ({ scannedAt: new Date().toISOString(), projects: scanned } satisfies GithubScanCacheEntry)
          : null;
      },
    );

    // A cached entry is only usable if it covers every currently active
    // project — a project onboarded since the cache was last written
    // would otherwise silently contribute zero issues until the next
    // refresh. When it doesn't, fall back to scanning just the missing
    // projects live rather than discarding an otherwise-good cache entry.
    const cachedByProjectId = new Map((scan?.projects ?? []).map((p) => [p.projectId, p.issues]));
    const missingProjects = projects.filter(({ project }) => !cachedByProjectId.has(project.id));

    let rawIssuesByProjectId = cachedByProjectId;
    if (missingProjects.length > 0) {
      const accessToken = await getValidGithubAccessToken(supabase, env, user.id);
      const freshlyScanned = await scanProjectIssues(accessToken, missingProjects, (project, error) => {
        logger.error("issues_project_scan_failed", {
          projectId: project.id,
          repositoryFullName: project.repositoryFullName,
          error: error instanceof Error ? error.message : String(error),
          requestId: c.get("requestId"),
        });
      });
      rawIssuesByProjectId = new Map(cachedByProjectId);
      for (const { projectId, issues: projectIssues } of freshlyScanned) {
        rawIssuesByProjectId.set(projectId, projectIssues);
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