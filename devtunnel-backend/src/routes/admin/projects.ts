import { Hono } from "hono";
import { z } from "zod";
import type { AdminProjectUpdatePayload, Env, Variables } from "../../types";
import { getEnv } from "../../config/env";
import { getSupabase } from "../../lib/supabase";
import { requireAuth } from "../../middleware/auth";
import { requireAdminRole, requirePermission } from "../../middleware/adminAuth";
import { checkRateLimit } from "../../lib/rateLimit";
import { errorResponse } from "../../lib/response";
import { logger } from "../../lib/logger";
import {
  AdminProjectDeleteError,
  AdminProjectUpdateError,
  deleteAdminProject,
  getAdminProjectById,
  getAdminProjectDetailById,
  getProjectGithubRepoRef,
  getProjectTechStack,
  listAdminProjects,
  listAllProjectGithubRepoRefs,
  refreshProjectGithubData,
  refreshProjectReadme,
  updateAdminProject,
} from "../../db/adminProjects";
import { listAdminProjectTasks } from "../../db/adminTasks";
import { recordAdminAudit } from "../../db/adminAudit";
import { getValidGithubAccessToken } from "../../db/githubTokens";
import { GitHubRepoError, fetchRepositoryIssues } from "../../lib/githubRepo";

/**
 * Admin — Projects (admin_workflow.txt section 4 — "Projects Page"; RBAC
 * permission `admin:projects:read` already reserved for these two exact
 * routes in src/lib/rbac.ts). Mounted at `/admin/projects` in
 * src/routes/admin/index.ts, alongside (not instead of)
 * `/admin/projects/onboarding` (src/routes/projectOnboarding.ts) — the two
 * modules are independent: onboarding drafts vs. already-active projects.
 */
export const adminProjects = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Query validation for `GET /admin/projects` (rules 14–15: every input is
 * validated server-side). `limit` is capped to bound response size/query
 * cost; `before` is a keyset cursor and must be a real ISO timestamp so the
 * `created_at < before` query stays well-formed.
 */
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  before: z.string().datetime({ offset: true }).optional(),
});

const idSchema = z.string().uuid("Invalid project id");

/**
 * Maps a `GitHubRepoError` (src/lib/githubRepo.ts) to the standard error
 * envelope — same mapping `src/routes/projectOnboarding.ts` already uses
 * for the same error type (rule 20: centralized, predictable error
 * handling for the same failure modes wherever they surface).
 */
function mapGithubError(c: Parameters<typeof errorResponse>[0], err: GitHubRepoError) {
  switch (err.reason) {
    case "not_found":
      return errorResponse(c, 404, "repository_not_found", err.message);
    case "rate_limited":
      return errorResponse(c, 429, "github_rate_limited", err.message);
    case "invalid_url":
      return errorResponse(c, 400, "invalid_repository_url", err.message);
    case "unauthorized":
      return errorResponse(c, 401, "github_reauth_required", err.message);
    default:
      return errorResponse(c, 502, "github_unavailable", err.message);
  }
}

/**
 * Body validation for `PATCH /admin/projects/:id` (section 22 — Admin
 * Backend API Map, "Projects"). Deliberately mirrors, field for field,
 * the Step 2 (`descriptionSchema`) and Step 3 (`techStackSchema`) Zod
 * schemas in src/routes/projectOnboarding.ts — same "existing vs custom
 * description" and tech-stack shape, just editable after the project is
 * already live instead of during onboarding. Kept as a local copy rather
 * than a shared import: the two route modules validate genuinely
 * different resources (an onboarding draft vs. an already-active
 * project) and this backend has no shared-validators module today (rule
 * 103: don't add structure/dependencies a feature doesn't actually need).
 *
 * `.refine` at the top level requires at least one of `description` /
 * `techStack` to be present — an empty `{}` body is rejected as a 400
 * rather than silently accepted as a no-op PATCH (rule 17: don't paper
 * over a caller mistake as success).
 */
const updateDescriptionSchema = z
  .object({
    choice: z.enum(["EXISTING", "CUSTOM"]),
    customDescription: z.string().trim().max(20_000).nullable().optional(),
  })
  .refine((val) => val.choice !== "CUSTOM" || !!val.customDescription?.trim(), {
    message: "Custom description is required when choosing a custom description",
    path: ["customDescription"],
  });

const updateTechStackSchema = z.object({
  languages: z.array(z.string().min(1).max(60)).max(30),
  frontend: z.array(z.string().min(1).max(60)).max(30),
  backend: z.array(z.string().min(1).max(60)).max(30),
  frameworks: z.array(z.string().min(1).max(60)).max(30),
  databases: z.array(z.string().min(1).max(60)).max(30),
  libraries: z.array(z.string().min(1).max(60)).max(30),
  buildTools: z.array(z.string().min(1).max(60)).max(30),
  packageManager: z.string().min(1).max(60).nullable(),
});

/**
 * `status` — toggles a project between `ACTIVE` and `ARCHIVED`
 * (`devtunnel.project_status`, sql/006 + sql/019). Backs the Project
 * Detail page's "Archive project" / "Reactivate project" action
 * (`ProjectStatusToggle`) — a plain enum flip through the same `PATCH`
 * endpoint used for Description/Tech Stack, not a separate route, since
 * it's still one column on the same `devtunnel.projects` row.
 */
const updateProjectSchema = z
  .object({
    description: updateDescriptionSchema.optional(),
    techStack: updateTechStackSchema.optional(),
    status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  })
  .refine(
    (val) =>
      val.description !== undefined || val.techStack !== undefined || val.status !== undefined,
    {
      message: "Provide at least one field to update (description, techStack, or status)",
    },
  );

/**
 * Body validation for `DELETE /admin/projects/:id`. `reason` is optional
 * and free-text — stored verbatim on `devtunnel.projects.delete_reason`
 * (sql/008) for the audit trail, never parsed or branched on. Capped well
 * under any column/log size concern (rule 59: never let unbounded
 * user-controlled text flow into storage or logs unchecked).
 */
const deleteBodySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

/**
 * `GET /admin/projects` (admin_workflow.txt section 4 & 22).
 *
 * "Show all projects currently available on DevTunnel." Returns every
 * DevTunnel project (each row backed by `devtunnel.admin_project_list`,
 * sql/007), newest first.
 *
 * The response body is the raw `AdminProjectSummary[]` array — NOT wrapped
 * in the `{ data: ... }` envelope used elsewhere in this backend
 * (src/lib/response.ts) — to match the already-shipped frontend contract
 * in devtunnel-frontend/src/lib/admin/projects/api.ts
 * (`const data = (await res.json()) as AdminProjectSummary[]`), the same
 * documented exception already used for src/routes/projectOnboarding.ts.
 * Error responses still use the standard `{ error: { code, message,
 * requestId } }` envelope — the frontend only branches on `res.ok`, never
 * the error body shape, so this doesn't introduce a second incompatible
 * convention for the same caller.
 *
 * Because the body must stay a plain array to match that contract, the
 * keyset pagination cursor for the next page (rule 21/108: pagination is
 * mandatory for large collections) is returned via the `X-Next-Cursor`
 * response header instead of the body — present only when another page
 * exists. Today's frontend page fetches once with no query params and
 * renders whatever comes back; a "load more" control can start passing
 * `?before=<X-Next-Cursor>` whenever it's built, with no backend change.
 */
adminProjects.get(
  "/",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:read"),
  async (c) => {
    const env = getEnv(c.env);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-projects-list",
      limit: 60,
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
      const { projects, nextCursor } = await listAdminProjects(supabase, {
        limit: parsed.data.limit,
        before: parsed.data.before ?? null,
      });

      if (nextCursor) {
        c.header("X-Next-Cursor", nextCursor);
      }
      return c.json(projects, 200);
    } catch (err) {
      logger.error("admin_projects_list_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load projects right now");
    }
  },
);

/**
 * `GET /admin/projects/:id` (admin_workflow.txt section 18 — "Project
 * Detail Page"; section 22).
 *
 * Backs the whole project detail page
 * (devtunnel-frontend/src/app/admin/(protected)/projects/[id]/page.tsx),
 * not just the table's "View" action — returns `AdminProjectDetail`
 * (src/types.ts), the `AdminProjectSummary` fields PLUS
 * `githubDescription`/`readme`/`openIssuesCount`, matching the frontend's
 * already-shipped contract in devtunnel-frontend/src/lib/admin/projects/
 * types.ts exactly. Previously this returned the plain `AdminProjectSummary`
 * — missing precisely the three fields that page's Description/README/
 * "Open GitHub issues" sections render, so they always showed empty.
 *
 * Full DevTunnel/GitHub contributor *lists* (as opposed to the counts
 * already included here) still belong to the separate, not-yet-requested
 * `/admin/projects/:id/contributors` and `/admin/projects/:id/github-
 * contributors` routes (section 22) — this endpoint only ever returns
 * counts for those, consistent with `AdminProjectSummary`.
 */
adminProjects.get(
  "/:id",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:read"),
  async (c) => {
    const env = getEnv(c.env);

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-projects-detail",
      limit: 120,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    try {
      const supabase = getSupabase(env);
      const project = await getAdminProjectDetailById(supabase, idResult.data);
      if (!project) {
        return errorResponse(c, 404, "project_not_found", "Project not found");
      }
      return c.json(project, 200);
    } catch (err) {
      logger.error("admin_project_detail_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load this project right now");
    }
  },
);

/**
 * `GET /admin/projects/:id/github/issues` (admin_workflow.txt section 10
 * ▸ Step 2 — "Select Existing Issue"; RBAC permission
 * `admin:projects:github:read`, src/lib/rbac.ts).
 *
 * "After selecting a project: Fetch GitHub Issues ... The Admin should
 * not need to manually type an issue number if it already exists on
 * GitHub." Backs Task Onboarding Step 2's issue picker — resolves the
 * project's GitHub coordinates from what Project Onboarding already
 * captured (`getProjectGithubRepoRef`, never a client-supplied
 * owner/repo — rule 15), then fetches that repository's open issues
 * directly from GitHub. This is a live read (not cached/snapshotted) —
 * unlike a *selected* issue (sql/010's `github_issue` snapshot), the
 * picker itself should always reflect GitHub's current open-issue list.
 *
 * Kept on `/admin/projects` (not `/admin/tasks/onboarding`) because the
 * issues belong to the *project's* repository, not to any one
 * in-progress task draft — the same project's issues are fetched fresh
 * every time Step 2 runs, regardless of which draft is asking.
 *
 * Response body is the raw `GithubIssueSummary[]` array — NOT wrapped in
 * the `{ data: ... }` envelope (src/lib/response.ts) — matching every
 * other Task/Project Onboarding list route's already-documented
 * exception (see `GET /admin/projects` above).
 */
adminProjects.get(
  "/:id/github/issues",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:github:read"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern used throughout this file.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-projects-github-issues",
      limit: 30,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    try {
      const supabase = getSupabase(env);

      const repoRef = await getProjectGithubRepoRef(supabase, idResult.data);
      if (!repoRef) {
        return errorResponse(c, 404, "project_not_found", "Project not found");
      }

      const accessToken = await getValidGithubAccessToken(supabase, env, admin.id);
      const issues = await fetchRepositoryIssues(accessToken, repoRef.owner, repoRef.repo);

      return c.json(issues, 200);
    } catch (err) {
      if (err instanceof GitHubRepoError) return mapGithubError(c, err);
      logger.error("admin_project_github_issues_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load GitHub issues right now");
    }
  },
);

/**
 * `GET /admin/projects/:id/tech-stack` (admin_workflow.txt section 10 ▸
 * Step 4 — "Fetch Project Tech Stack" ▸ Backend; RBAC permission
 * `admin:projects:read`, src/lib/rbac.ts — a read-only, non-GitHub call
 * unlike `/github/issues` above, so it stays on the cheaper permission
 * per that file's own comment).
 *
 * "This should happen automatically after project selection ... Do not
 * re-analyze the repository unnecessarily if the project already has a
 * validated tech stack from Project Onboarding." Backs Task Onboarding
 * Step 4's `fetchProjectTechStack` (devtunnel-frontend/src/lib/admin/
 * task-onboarding/api.ts) — reads the project's already-recorded
 * `tech_stack` column (sql/006, populated by Project Onboarding Step 3)
 * via `getProjectTechStack`, rather than triggering a second repository
 * analysis.
 *
 * Two reads, same as `getAdminProjectDetailById` above: `getAdminProjectById`
 * first, purely to tell "project doesn't exist / was soft-deleted" (404)
 * apart from "project exists but has no tech stack recorded yet" — the
 * frontend's `OnboardingTechStack` shape has no third "unknown" state, so
 * an existing project with nothing detected gets the same all-empty shape
 * Project Onboarding's own Step 3 would show before analysis ever ran,
 * not an error.
 */
adminProjects.get(
  "/:id/tech-stack",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:read"),
  async (c) => {
    const env = getEnv(c.env);

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-projects-tech-stack",
      limit: 120,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    try {
      const supabase = getSupabase(env);

      const project = await getAdminProjectById(supabase, idResult.data);
      if (!project) {
        return errorResponse(c, 404, "project_not_found", "Project not found");
      }

      const techStack = await getProjectTechStack(supabase, idResult.data);
      return c.json(
        techStack ?? {
          languages: [],
          frontend: [],
          backend: [],
          frameworks: [],
          databases: [],
          libraries: [],
          buildTools: [],
          packageManager: null,
        },
        200,
      );
    } catch (err) {
      logger.error("admin_project_tech_stack_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load this project's tech stack right now");
    }
  },
);

/**
 * `GET /admin/projects/:id/tasks` (admin_workflow.txt section 18 —
 * "Project Detail Page"; RBAC permission `admin:projects:read`, same as
 * `/:id/tech-stack` above — a plain read of already-curated DevTunnel
 * data, no GitHub call).
 *
 * Backs the Project Detail page's "DevTunnel tasks" section — the actual
 * list behind the `taskCount` stat already shown on this page
 * (`AdminProjectSummary.taskCount`, sql/015). Response body is the raw
 * `AdminTaskSummary[]` array — NOT wrapped in the `{ data: ... }`
 * envelope — same documented exception as every other list route in this
 * file (see `GET /admin/projects` above).
 */
adminProjects.get(
  "/:id/tasks",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:read"),
  async (c) => {
    const env = getEnv(c.env);

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-projects-tasks",
      limit: 120,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    try {
      const supabase = getSupabase(env);

      const project = await getAdminProjectById(supabase, idResult.data);
      if (!project) {
        return errorResponse(c, 404, "project_not_found", "Project not found");
      }

      const tasks = await listAdminProjectTasks(supabase, idResult.data);
      return c.json(tasks, 200);
    } catch (err) {
      logger.error("admin_project_tasks_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load this project's tasks right now");
    }
  },
);

/**
 * `PATCH /admin/projects/:id` (admin_workflow.txt section 22 — Admin
 * Backend API Map, "Projects"; RBAC permission `admin:projects:write`
 * already reserved for this exact route in src/lib/rbac.ts).
 *
 * Backs the Project Detail page's inline edit panel
 * (devtunnel-frontend `EditProjectDetailsPanel` /
 * `updateAdminProject` in devtunnel-frontend/src/lib/admin/projects/
 * client-api.ts) — lets an Admin correct the two fields Project
 * Onboarding's Step 2 (Description) and Step 3 (Tech Stack) already hand
 * them control over, after the project is already live. Every other
 * field on the project (name, repository, author, GitHub contributors,
 * README, open issue count) is GitHub- or backend-derived and has no
 * writable path through this endpoint — see `updateProjectSchema` and
 * `AdminProjectUpdatePayload` (src/types.ts) for exactly what is and
 * isn't accepted.
 *
 * Returns the full, freshly-read `AdminProjectDetail` (not just the two
 * changed fields) so the frontend can replace its local state directly
 * from the response without a second round-trip — same contract
 * `updateAdminProject` in client-api.ts already expects.
 */
adminProjects.patch(
  "/:id",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:write"),
  async (c) => {
    const env = getEnv(c.env);
    const user = c.get("user")!;

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-projects-update",
      limit: 30,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    const rawBody = await c.req.json().catch(() => null);
    const bodyResult = updateProjectSchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        bodyResult.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    const supabase = getSupabase(env);

    // Normalize the Zod-inferred shape into `AdminProjectUpdatePayload`
    // (src/types.ts) before handing it to the db layer: Zod's
    // `.nullable().optional()` on `customDescription` infers
    // `string | null | undefined`, while `OnboardingDescription` (shared
    // with the onboarding wizard's own draft shape) only ever allows
    // `string | null` — same normalization
    // `POST /admin/projects/onboarding/:id/description`
    // (src/routes/projectOnboarding.ts) already applies via
    // `bodyResult.data.customDescription ?? null`.
    const updatePayload: AdminProjectUpdatePayload = {};
    if (bodyResult.data.description) {
      updatePayload.description = {
        choice: bodyResult.data.description.choice,
        customDescription: bodyResult.data.description.customDescription ?? null,
      };
    }
    if (bodyResult.data.techStack) {
      updatePayload.techStack = bodyResult.data.techStack;
    }
    if (bodyResult.data.status) {
      updatePayload.status = bodyResult.data.status;
    }

    try {
      const project = await updateAdminProject(supabase, idResult.data, updatePayload);

      // Best-effort audit trail (rule 96: audit important administrative
      // actions). Only records *which* fields changed and the chosen
      // description source — never the free-text custom description or
      // full tech-stack payload itself (rule 59: don't let unbounded
      // user-controlled text flow into logs/audit rows unchecked).
      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_PROJECT_UPDATED",
          resourceType: "project",
          resourceId: project.id,
          result: "SUCCESS",
          metadata: {
            slug: project.slug,
            updatedFields: Object.keys(updatePayload),
            descriptionChoice: updatePayload.description?.choice ?? null,
          },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return c.json(project, 200);
    } catch (err) {
      if (err instanceof AdminProjectUpdateError) {
        if (err.code === "not_found") {
          return errorResponse(c, 404, "project_not_found", "Project not found");
        }
        // deleted
        return errorResponse(c, 409, "project_deleted", err.message);
      }

      logger.error("admin_project_update_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });

      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_PROJECT_UPDATED",
          resourceType: "project",
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

      return errorResponse(c, 500, "internal_error", "Couldn't update this project right now");
    }
  },
);

/**
 * `POST /admin/projects/:id/refresh-readme` — Project Detail edit
 * panel's "Fetch latest README" action (`EditProjectDetailsPanel`).
 * Re-pulls the repository's current README from GitHub and overwrites
 * the stored copy — everything else Project Onboarding Step 1 imported
 * (name, description, contributors, stars, forks, issues) is untouched;
 * this is the one field that can go stale between import and today
 * without the admin re-running onboarding.
 *
 * Uses `requirePermission("admin:projects:write")` — same permission
 * `PATCH /admin/projects/:id` requires, since this is still a write to
 * the same row, just sourced from GitHub instead of the request body.
 */
adminProjects.post(
  "/:id/refresh-readme",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern used throughout this file.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-projects-refresh-readme",
      limit: 20,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    const supabase = getSupabase(env);

    try {
      const repoRef = await getProjectGithubRepoRef(supabase, idResult.data);
      if (!repoRef) {
        return errorResponse(c, 404, "project_not_found", "Project not found");
      }

      const accessToken = await getValidGithubAccessToken(supabase, env, admin.id);
      const project = await refreshProjectReadme(supabase, accessToken, repoRef, idResult.data);

      // Best-effort audit trail (rule 96), same convention as
      // `PATCH /:id` above.
      try {
        await recordAdminAudit(supabase, {
          adminId: admin.id,
          action: "ADMIN_PROJECT_README_REFRESHED",
          resourceType: "project",
          resourceId: project.id,
          result: "SUCCESS",
          metadata: { slug: project.slug },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return c.json(project, 200);
    } catch (err) {
      if (err instanceof GitHubRepoError) return mapGithubError(c, err);
      if (err instanceof AdminProjectUpdateError) {
        return errorResponse(c, 404, "project_not_found", "Project not found");
      }
      logger.error("admin_project_refresh_readme_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't refresh the README right now");
    }
  },
);

/**
 * `POST /admin/projects/:id/sync` — Project Detail page's "Sync GitHub
 * data" action.
 *
 * Re-fetches contributors, stars, forks, primary language, and
 * open/closed issue counts from GitHub and overwrites those columns —
 * see `refreshProjectGithubData` (src/db/adminProjects.ts) for why this
 * is needed: every one of these fields is captured once at onboarding
 * time and otherwise never refreshed, so an older or long-lived project
 * can show a stale contributor count or an issue split that predates
 * `fetchRepositoryIssueCounts`. Never touches the README (its own
 * `/refresh-readme` action above), description, tech stack, or status —
 * same GitHub-derived-vs-Admin-curated boundary `updateAdminProject`
 * enforces.
 *
 * Uses `requirePermission("admin:projects:write")` — same permission
 * `/refresh-readme` and `PATCH /:id` require, since this is still a
 * write to the same row.
 */
adminProjects.post(
  "/:id/sync",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern used throughout this file.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-projects-sync",
      limit: 20,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    const supabase = getSupabase(env);

    try {
      const repoRef = await getProjectGithubRepoRef(supabase, idResult.data);
      if (!repoRef) {
        return errorResponse(c, 404, "project_not_found", "Project not found");
      }

      const accessToken = await getValidGithubAccessToken(supabase, env, admin.id);
      const project = await refreshProjectGithubData(supabase, accessToken, repoRef, idResult.data);

      // Best-effort audit trail (rule 96), same convention as
      // `/refresh-readme` above.
      try {
        await recordAdminAudit(supabase, {
          adminId: admin.id,
          action: "ADMIN_PROJECT_GITHUB_DATA_SYNCED",
          resourceType: "project",
          resourceId: project.id,
          result: "SUCCESS",
          metadata: {
            slug: project.slug,
            githubContributorCount: project.githubContributorCount,
            openIssuesCount: project.openIssuesCount,
            closedIssuesCount: project.closedIssuesCount,
          },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return c.json(project, 200);
    } catch (err) {
      if (err instanceof GitHubRepoError) return mapGithubError(c, err);
      if (err instanceof AdminProjectUpdateError) {
        return errorResponse(c, 404, "project_not_found", "Project not found");
      }
      logger.error("admin_project_sync_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't sync this project's GitHub data right now");
    }
  },
);

/**
 * `POST /admin/projects/sync-all` — All Projects page's "Sync GitHub
 * data" action, next to "Onboard a project".
 *
 * Does exactly the same work as `POST /:id/sync` above, once per active
 * project instead of once for a single id — same
 * `refreshProjectGithubData` call, same GitHub-derived-only fields, same
 * "never touches README/description/tech-stack/status" boundary. Not a
 * second implementation of the sync logic, just this route's own loop
 * over every project `getProjectGithubRepoRef`'s bulk counterpart
 * (`listAllProjectGithubRepoRefs`) returns.
 *
 * Runs sequentially (one project's three GitHub calls finish before the
 * next project starts) rather than firing all projects' requests at
 * once — this can run across every onboarded project, and GitHub's API
 * has its own rate limits this admin's token is subject to regardless of
 * how DevTunnel batches its own requests.
 *
 * One project failing (deleted mid-loop, GitHub 404s it, etc.) never
 * aborts the rest — every project gets a real attempt and the response
 * reports per-project results so the Admin can see exactly what synced
 * and what didn't, rather than an all-or-nothing result hiding partial
 * success (rule 17: never paper over a partial outcome as full success
 * or full failure).
 */
adminProjects.post(
  "/sync-all",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    // Tighter than the per-project bucket (20/min) since one call here can
    // itself trigger dozens of underlying GitHub requests.
    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-projects-sync-all",
      limit: 5,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    const supabase = getSupabase(env);

    try {
      const refs = await listAllProjectGithubRepoRefs(supabase);
      const accessToken = await getValidGithubAccessToken(supabase, env, admin.id);

      const synced: string[] = [];
      const failed: Array<{ id: string; slug: string; error: string; resetAt: string | null }> = [];

      // Once one project in this loop comes back rate-limited, GitHub's
      // rate limit is a single per-token budget shared by every request —
      // it will not "come back" mid-loop, so every remaining project is
      // certain to fail the exact same way. `rateLimitedAt` short-circuits
      // the rest of the loop the moment that happens: remaining projects
      // are marked failed immediately, without spending a real (always
      // 403/429, ~15s-timeout-bound) round trip on each one. This is what
      // was actually behind the ~32s `sync-all` response time in earlier
      // rate-limited runs — 20+ projects each still doing a full failing
      // fetch after the quota was already known to be exhausted.
      let rateLimitedAt: Date | null | undefined;

      for (const ref of refs) {
        if (rateLimitedAt !== undefined) {
          failed.push({
            id: ref.id,
            slug: ref.slug,
            error: "rate_limited",
            resetAt: rateLimitedAt?.toISOString() ?? null,
          });
          continue;
        }

        try {
          await refreshProjectGithubData(supabase, accessToken, { owner: ref.owner, repo: ref.repo }, ref.id);
          synced.push(ref.id);
        } catch (err) {
          logger.error("admin_project_sync_all_item_failed", {
            projectId: ref.id,
            slug: ref.slug,
            error: err instanceof Error ? err.message : String(err),
            requestId: c.get("requestId"),
          });
          if (err instanceof GitHubRepoError && err.reason === "rate_limited") {
            rateLimitedAt = err.resetAt;
          }
          failed.push({
            id: ref.id,
            slug: ref.slug,
            error: err instanceof GitHubRepoError ? err.reason : "internal_error",
            // Surfaced separately from `error` (the stable reason code the
            // frontend already branches on) so a rate-limited item can show
            // "try again at HH:MM" — `null` for every non-rate-limit failure
            // and for a rate limit whose response happened to omit the
            // header (see GitHubRepoError.resetAt).
            resetAt:
              err instanceof GitHubRepoError && err.resetAt ? err.resetAt.toISOString() : null,
          });
        }
      }

      // Best-effort audit trail (rule 96), same convention as `/:id/sync`.
      try {
        await recordAdminAudit(supabase, {
          adminId: admin.id,
          action: "ADMIN_PROJECTS_GITHUB_DATA_SYNCED_ALL",
          resourceType: "project",
          resourceId: null,
          result: failed.length === 0 ? "SUCCESS" : "FAILURE",
          metadata: { total: refs.length, syncedCount: synced.length, failedCount: failed.length },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return c.json({ total: refs.length, synced: synced.length, failed }, 200);
    } catch (err) {
      logger.error("admin_project_sync_all_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't sync projects' GitHub data right now");
    }
  },
);

/**
 * `DELETE /admin/projects/:id`.
 *
 * Not in admin_workflow.txt's section 22 route map (which only lists
 * GET/GET/PATCH for `/admin/projects`), but section 15's soft-delete
 * guidance for DevTunnel tasks applies with equal force to projects — a
 * project carries real history (tasks, submissions, PRs) that must
 * survive removal, so this is a soft delete via `delete_admin_project`
 * (sql/008), never a physical row delete. Uses a dedicated
 * `admin:projects:delete` permission (src/lib/rbac.ts) rather than
 * reusing `admin:projects:write` — write and delete are different blast
 * radii and a narrower admin role could plausibly get one without the
 * other later (same reasoning as the rest of this RBAC table).
 *
 * Idempotency: deleting an already-deleted project returns 409, not a
 * silent 200 — the caller should know their delete didn't do anything
 * (rule 17: don't paper over a no-op as success).
 */
adminProjects.delete(
  "/:id",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:projects:delete"),
  async (c) => {
    const env = getEnv(c.env);
    const user = c.get("user")!;

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    // Body is optional — an empty/absent body is a valid delete with no
    // reason recorded, so a JSON parse failure here is treated as "no
    // body" rather than a 400 (rule 73: don't be brittle against a caller
    // that simply omitted an optional field).
    let rawBody: unknown = {};
    try {
      rawBody = await c.req.json();
    } catch {
      rawBody = {};
    }
    const bodyResult = deleteBodySchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return errorResponse(c, 400, "invalid_request", bodyResult.error.issues[0]!.message);
    }

    // Tighter than the read endpoints — a destructive action is rate
    // limited more aggressively (rule 43/85: sensitive/destructive
    // endpoints get stricter limits than routine reads).
    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-projects-delete",
      limit: 20,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    const supabase = getSupabase(env);

    try {
      const result = await deleteAdminProject(
        supabase,
        user.id,
        idResult.data,
        bodyResult.data.reason ?? null,
      );

      // Best-effort audit trail (rule 96: audit important administrative
      // actions). Mirrors requireAdminRole/requirePermission's
      // auditDenied — a failure here must never fail the delete that
      // already succeeded; it's logged loudly instead (rule 21).
      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_PROJECT_DELETED",
          resourceType: "project",
          resourceId: result.id,
          result: "SUCCESS",
          metadata: { slug: result.slug, name: result.name, reason: bodyResult.data.reason ?? null },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return c.json(result, 200);
    } catch (err) {
      if (err instanceof AdminProjectDeleteError) {
        if (err.code === "not_found") {
          return errorResponse(c, 404, "project_not_found", "Project not found");
        }
        // already_deleted
        return errorResponse(c, 409, "project_already_deleted", err.message);
      }

      logger.error("admin_project_delete_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });

      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_PROJECT_DELETED",
          resourceType: "project",
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

      return errorResponse(c, 500, "internal_error", "Couldn't delete this project right now");
    }
  },
);