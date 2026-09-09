import { Hono } from "hono";
import { z } from "zod";
import type { AdminNewIssue, Env, Variables } from "../../types";
import { getEnv } from "../../config/env";
import { getSupabase } from "../../lib/supabase";
import { requireAuth } from "../../middleware/auth";
import { requireAdminRole, requirePermission } from "../../middleware/adminAuth";
import { checkRateLimit } from "../../lib/rateLimit";
import { errorResponse } from "../../lib/response";
import { logger } from "../../lib/logger";
import {
  NewIssueProjectNotFoundError,
  getCoveredIssueNumbersByProject,
  getIgnoredIssueKeysByProject,
  ignoreNewIssue,
  ignoredIssueKey,
  listActiveProjectsWithRepo,
} from "../../db/adminNewIssues";
import { recordAdminAudit } from "../../db/adminAudit";
import { getValidGithubAccessToken } from "../../db/githubTokens";
import { fetchRepositoryIssues } from "../../lib/githubRepo";

/**
 * Admin — New Issues (admin_workflow.txt section 9 — "DevTunnel Task
 * Lifecycle"; section 16 — "New Issues Section"; section 17 — "New
 * Issues Flow"; RBAC permissions `admin:new-issues:read` /
 * `admin:new-issues:write`, src/lib/rbac.ts). Mounted at
 * `/admin/new-issues` in src/routes/admin/index.ts.
 *
 * Backs devtunnel-frontend's `/admin/tasks/new-issues` page
 * (devtunnel-frontend/src/lib/admin/new-issues/{types,api,client-api}.ts)
 * — a New Issue is a live GitHub issue that isn't a DevTunnel resource
 * yet ("DevTunnel does not need to represent every GitHub issue as a
 * DevTunnel task", section 9), so nothing here is an onboarding draft;
 * see src/db/adminNewIssues.ts for the actual diff/detection queries.
 */
export const adminNewIssues = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * `id` path param validation for `POST /admin/new-issues/:id/ignore`.
 * `AdminNewIssue.id` (and this endpoint's `:id`) is a composite
 * `{projectUuid}:{githubIssueNumber}` — never a task id, since no task
 * exists yet (see `AdminNewIssue`'s own doc comment in src/types.ts).
 * Validated as one shape here rather than two separate params so a
 * malformed id is rejected with one clear 400 before any db/GitHub call
 * (Backend_Development_Rules.txt rule 14/16: validate every input,
 * reject invalid requests early).
 */
const newIssueIdSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[1-9][0-9]*$/,
    "Invalid new issue id",
  );

function parseNewIssueId(id: string): { projectId: string; issueNumber: number } {
  const separatorIndex = id.lastIndexOf(":");
  const projectId = id.slice(0, separatorIndex);
  const issueNumber = Number(id.slice(separatorIndex + 1));
  return { projectId, issueNumber };
}

/**
 * `GET /admin/new-issues` (admin_workflow.txt section 16 ▸ Backend;
 * section 22 — Admin Backend API Map).
 *
 * Implements section 9 / section 16's detection algorithm exactly: for
 * every active project, fetch its open GitHub issues, subtract the
 * issues already covered by a (non-deleted) `devtunnel.tasks` row and
 * any issue an admin has explicitly ignored, and return what's left.
 * Compares by **issue number + repository identity** (each issue is
 * always scoped to the one project it came from) — never by title,
 * exactly as section 9 requires.
 *
 * Response body is the raw `AdminNewIssue[]` array — NOT wrapped in the
 * `{ data: ... }` envelope (src/lib/response.ts) — matching the
 * already-shipped frontend contract in
 * devtunnel-frontend/src/lib/admin/new-issues/api.ts
 * (`(await res.json()) as AdminNewIssue[]`), the same documented
 * exception every other Admin list route in this backend already uses
 * (see `GET /admin/projects` in src/routes/admin/projects.ts). An empty
 * array (never a 404) is returned when there's nothing new, matching
 * that same convention.
 *
 * Each active project's repository is scanned independently
 * (`Promise.allSettled`) — one project's GitHub call failing (private
 * repo, transient GitHub outage, revoked token, ...) never fails the
 * whole response; that project simply contributes no issues this time,
 * and the failure is logged loudly rather than silently swallowed
 * (rule 21). A hard failure before any per-project scan starts (loading
 * the project list itself, or the admin's own GitHub token) still
 * surfaces as a 500, since at that point nothing could be computed at
 * all.
 */
adminNewIssues.get(
  "/",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:new-issues:read"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern used throughout this backend's admin
      // routes.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    // Scanning every active project's GitHub repository on every call is
    // the single most expensive read in this admin backend — rate limited
    // more tightly than a plain database list (rule 42: protect expensive
    // endpoints).
    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-new-issues-list",
      limit: 20,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    try {
      const supabase = getSupabase(env);

      const projects = await listActiveProjectsWithRepo(supabase);
      if (projects.length === 0) {
        return c.json([], 200);
      }

      const projectIds = projects.map(({ project }) => project.id);

      const [coveredByProject, ignoredKeys, accessToken] = await Promise.all([
        getCoveredIssueNumbersByProject(supabase, projectIds),
        getIgnoredIssueKeysByProject(supabase, projectIds),
        getValidGithubAccessToken(supabase, env, admin.id),
      ]);

      const perProjectResults = await Promise.allSettled(
        projects.map(async ({ project, owner, repo }) => {
          const issues = await fetchRepositoryIssues(accessToken, owner, repo);
          const coveredNumbers = coveredByProject.get(project.id) ?? new Set<number>();

          const newIssuesForProject: AdminNewIssue[] = [];
          for (const issue of issues) {
            if (coveredNumbers.has(issue.number)) continue;
            const key = ignoredIssueKey(project.id, issue.number);
            if (ignoredKeys.has(key)) continue;

            newIssuesForProject.push({
              id: key,
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
          return newIssuesForProject;
        }),
      );

      const newIssues: AdminNewIssue[] = [];
      perProjectResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          newIssues.push(...result.value);
          return;
        }
        const { project } = projects[index]!;
        logger.error("admin_new_issues_project_scan_failed", {
          projectId: project.id,
          repositoryFullName: project.repositoryFullName,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          requestId: c.get("requestId"),
        });
      });

      // Newest-updated-first across every project, matching
      // `fetchRepositoryIssues`'s own per-repository ordering
      // (`sort=updated&direction=desc`) now that results from multiple
      // repositories have been merged into one list.
      newIssues.sort((a, b) => (a.updatedAt > b.updatedAt ? -1 : a.updatedAt < b.updatedAt ? 1 : 0));

      return c.json(newIssues, 200);
    } catch (err) {
      logger.error("admin_new_issues_list_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load new issues right now");
    }
  },
);

/**
 * `POST /admin/new-issues/:id/ignore` (admin_workflow.txt section 16 ▸
 * Frontend action list — "View, Create Task, Ignore"). Not listed in
 * section 22's own API map (which only names the two `GET` routes for
 * this feature) — this is the natural minimal counterpart the Frontend's
 * action list requires and the already-shipped
 * `lib/admin/new-issues/client-api.ts` already calls, named to match the
 * workflow's own vocabulary ("Ignore") rather than repurposing
 * `DELETE /admin/tasks/:id` (an ignored issue was never a task — there is
 * nothing to delete).
 *
 * Effect is DevTunnel-side bookkeeping only — the underlying GitHub issue
 * is never modified, closed, or commented on (section 15's "the GitHub
 * issue is not deleted just because the DevTunnel representation is
 * deleted" applies here too). Persisted as one row in
 * `devtunnel.ignored_github_issues` (sql/014); un-ignoring is out of
 * scope for now (no route exists to reverse this) since nothing in the
 * spec's Frontend action list calls for it — flagging this here rather
 * than silently adding an unrequested endpoint.
 *
 * Returns `204 No Content` on success, matching
 * `DELETE /admin/tasks/:id`'s convention (`lib/admin/tasks/client-api.ts`
 * only ever checks `res.ok`) and exactly what
 * `lib/admin/new-issues/client-api.ts` already expects.
 */
adminNewIssues.post(
  "/:id/ignore",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:new-issues:write"),
  async (c) => {
    const env = getEnv(c.env);
    const user = c.get("user")!;

    const idResult = newIssueIdSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }
    const { projectId, issueNumber } = parseNewIssueId(idResult.data);

    // A destructive/state-changing action gets a tighter, write-specific
    // bucket than the list endpoint above (rule 43/85: sensitive
    // endpoints are rate limited; distinct buckets per route keep one
    // endpoint's traffic from exhausting another's budget).
    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-new-issues-ignore",
      limit: 30,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    const supabase = getSupabase(env);

    try {
      await ignoreNewIssue(supabase, user.id, projectId, issueNumber);

      // Best-effort audit trail (rule 96: audit important administrative
      // actions) — this changes what every other admin sees in the New
      // Issues list, the same "worth auditing" bar
      // `ADMIN_PROJECT_UPDATED` already applies to a project edit. A
      // failure writing this must never fail the ignore that already
      // succeeded (rule 21: log loudly, don't silently swallow — but
      // also don't let a secondary write undo a primary one that worked).
      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_NEW_ISSUE_IGNORED",
          resourceType: "github_issue",
          resourceId: idResult.data,
          result: "SUCCESS",
          metadata: { projectId, issueNumber },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return c.body(null, 204);
    } catch (err) {
      if (err instanceof NewIssueProjectNotFoundError) {
        return errorResponse(c, 404, "project_not_found", "Project not found");
      }

      logger.error("admin_new_issue_ignore_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });

      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_NEW_ISSUE_IGNORED",
          resourceType: "github_issue",
          resourceId: idResult.data,
          result: "FAILURE",
          metadata: { error: err instanceof Error ? err.message : String(err) },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return errorResponse(c, 500, "internal_error", "Couldn't ignore this issue right now");
    }
  },
);