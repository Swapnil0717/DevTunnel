// devtunnel-backend/src/routes/taskOnboarding.ts

import { Hono } from "hono";
import { z } from "zod";
import { getEnv } from "../config/env";
import { recordAdminAudit } from "../db/adminAudit";
import { getProjectGithubRepoRef, getProjectTechStack } from "../db/adminProjects";
import { getValidGithubAccessToken } from "../db/githubTokens";
import {
  TaskOnboardingError,
  attachTaskOnboardingTechStack,
  completeTaskOnboarding,
  computeTaskOnboardingValidation,
  getTaskOnboardingDraftForAdmin,
  getTaskOnboardingProjectById,
  listEligibleTaskOnboardingProjects,
  markTaskPreviewCompleted,
  saveTaskCuration,
  saveTaskIssueInformation,
  saveTaskValidationResult,
  selectTaskOnboardingIssue,
  selectTaskOnboardingProject,
  toTaskOnboardingDraft,
} from "../db/taskOnboarding";
import { GitHubRepoError, fetchRepositoryIssue } from "../lib/githubRepo";
import { logger } from "../lib/logger";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { getSupabase } from "../lib/supabase";
import { requireAdminRole, requirePermission } from "../middleware/adminAuth";
import { requireAuth } from "../middleware/auth";
import { Env, TaskOnboardingProjectOption, Variables } from "../types";

/**
 * Admin — Task Onboarding wizard (admin_workflow.txt section 10 — "Create
 * Task — Task Onboarding"; backend routes per section 22's "Task
 * onboarding" group; section 12 — "Task Creation Algorithm"). All 7
 * steps — **Project Selection**, **Select Existing Issue**, **Issue
 * Information**, **Fetch Project Tech Stack**, **Difficulty**, **Issue
 * Preview**, **Final Validation** — plus **Section 12 completion** are
 * implemented here.
 *
 * Every route here requires admin authentication + role (mounted the
 * same way as every other admin module — see src/routes/admin/index.ts)
 * plus the `admin:tasks:read`/`admin:tasks:write` RBAC permission
 * src/lib/rbac.ts reserves for task routes.
 *
 * Response bodies intentionally return the `TaskOnboardingProjectOption[]`
 * / `TaskOnboardingDraft` / `TaskOnboardingValidationResult` / `CreatedTask`
 * object directly — NOT wrapped in the `{ data: ... }` envelope used
 * elsewhere in this backend (src/lib/response.ts) — to match the
 * already-implemented frontend contract in
 * devtunnel-frontend/src/lib/admin/task-onboarding/api.ts, which parses
 * each response body directly as that type (the same documented exception
 * already used for src/routes/projectOnboarding.ts). Error responses
 * still use the standard `{ error: { code, message, requestId } }`
 * envelope — the frontend only inspects `res.ok`/`res.status` on failure,
 * never the error body shape, so this doesn't create two incompatible
 * conventions for the same caller.
 */
export const adminTaskOnboarding = new Hono<{ Bindings: Env; Variables: Variables }>();

function mapTaskOnboardingError(c: Parameters<typeof errorResponse>[0], err: TaskOnboardingError) {
  switch (err.code) {
    case "not_found":
      return errorResponse(c, 404, "task_onboarding_draft_not_found", err.message);
    case "already_completed":
      return errorResponse(c, 409, "task_onboarding_already_completed", err.message);
    case "project_ineligible":
      return errorResponse(c, 422, "project_not_eligible", err.message);
    case "issue_not_found":
      return errorResponse(c, 404, "issue_not_found", err.message);
    case "step_incomplete":
      return errorResponse(c, 409, "task_onboarding_step_incomplete", err.message);
    case "project_unavailable":
      return errorResponse(c, 409, "task_onboarding_project_unavailable", err.message);
    default:
      return errorResponse(c, 409, "task_onboarding_conflict", err.message);
  }
}

/**
 * Maps a `GitHubRepoError` (src/lib/githubRepo.ts) to the standard error
 * envelope — same mapping already used by
 * src/routes/admin/projects.ts / src/routes/projectOnboarding.ts for the
 * same error type (rule 20: centralized, predictable error handling for
 * the same failure modes wherever they surface).
 */
function mapGithubError(c: Parameters<typeof errorResponse>[0], err: GitHubRepoError) {
  switch (err.reason) {
    case "not_found":
      return errorResponse(c, 404, "issue_not_found", err.message);
    case "rate_limited":
      return errorResponse(c, 429, "github_rate_limited", err.message);
    case "invalid_url":
      return errorResponse(c, 400, "invalid_request", err.message);
    case "unauthorized":
      return errorResponse(c, 401, "github_reauth_required", err.message);
    default:
      return errorResponse(c, 502, "github_unavailable", err.message);
  }
}

/* ---------------------------------------------------------------------- *
 * Step 1 — GET /admin/tasks/onboarding/projects
 * ---------------------------------------------------------------------- */

adminTaskOnboarding.get(
  "/projects",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:tasks:read"),
  async (c) => {
    const env = getEnv(c.env);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-task-onboarding-projects-list",
      limit: 60,
      windowSeconds: 60,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");

    try {
      const supabase = getSupabase(env);
      const projects = await listEligibleTaskOnboardingProjects(supabase);
      return c.json(projects, 200);
    } catch (err) {
      logger.error("admin_task_onboarding_projects_list_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load projects right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 1 — POST /admin/tasks/onboarding
 * ---------------------------------------------------------------------- */

const selectProjectSchema = z.object({
  projectId: z.string().uuid("Invalid project id"),
  draftId: z.string().uuid("Invalid onboarding draft id").optional(),
});

adminTaskOnboarding.post(
  "/",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:tasks:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as src/routes/projectOnboarding.ts.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-task-onboarding-select-project",
      limit: 20,
      windowSeconds: 300,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    const bodyResult = selectProjectSchema.safeParse(await c.req.json().catch(() => null));
    if (!bodyResult.success) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        bodyResult.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    try {
      const supabase = getSupabase(env);
      const isNewDraft = !bodyResult.data.draftId;

      const { draft, project } = await selectTaskOnboardingProject(
        supabase,
        admin.id,
        bodyResult.data.draftId,
        bodyResult.data.projectId,
      );

      return c.json(toTaskOnboardingDraft(draft, project), isNewDraft ? 201 : 200);
    } catch (err) {
      if (err instanceof TaskOnboardingError) return mapTaskOnboardingError(c, err);
      logger.error("admin_task_onboarding_select_project_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't select the project right now");
    }
  },
);

const draftIdSchema = z.string().uuid("Invalid onboarding draft id");

/**
 * Loads a draft's currently-attached project for response purposes,
 * throwing the same `TaskOnboardingError` shape as every other
 * business-rule failure in this module rather than a bare 404/500 —
 * indicates the project a draft still points at has since disappeared
 * (e.g. deleted between Step 1 and now), which is a conflict on this
 * *draft*, not an "issue not found" or generic internal error (rule 20:
 * centralized, predictable error handling).
 */
async function loadDraftProject(
  supabase: ReturnType<typeof getSupabase>,
  projectId: string,
): Promise<TaskOnboardingProjectOption> {
  const project = await getTaskOnboardingProjectById(supabase, projectId);
  if (!project) {
    throw new TaskOnboardingError(
      "conflict",
      "The project attached to this task onboarding draft no longer exists",
    );
  }
  return project;
}

/* ---------------------------------------------------------------------- *
 * Step 2 — PATCH /admin/tasks/onboarding/:id/issue
 * ---------------------------------------------------------------------- */

const selectIssueSchema = z.object({
  issueNumber: z.number().int().positive("Invalid issue number"),
});

adminTaskOnboarding.patch(
  "/:id/issue",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:tasks:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as this file's other routes.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const draftIdResult = draftIdSchema.safeParse(c.req.param("id"));
    if (!draftIdResult.success) {
      return errorResponse(c, 400, "invalid_request", draftIdResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-task-onboarding-select-issue",
      limit: 20,
      windowSeconds: 300,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    const bodyResult = selectIssueSchema.safeParse(await c.req.json().catch(() => null));
    if (!bodyResult.success) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        bodyResult.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    try {
      const supabase = getSupabase(env);

      // Load the draft first purely to find which project's repository to
      // query — `selectTaskOnboardingIssue` below re-validates ownership
      // and editability itself before writing anything (rule 15: never
      // trust an earlier read as authorization for the write that follows).
      const draft = await getTaskOnboardingDraftForAdmin(supabase, draftIdResult.data, admin.id);
      if (!draft) {
        return mapTaskOnboardingError(
          c,
          new TaskOnboardingError("not_found", "Task onboarding draft not found"),
        );
      }
      if (draft.completed_task_id) {
        return mapTaskOnboardingError(
          c,
          new TaskOnboardingError(
            "already_completed",
            "This task onboarding draft has already been completed and can no longer be edited",
          ),
        );
      }

      const repoRef = await getProjectGithubRepoRef(supabase, draft.project_id);
      if (!repoRef) {
        return mapTaskOnboardingError(
          c,
          new TaskOnboardingError(
            "project_ineligible",
            "This draft's project is no longer available — it may have been deleted",
          ),
        );
      }

      // Re-fetch the issue directly from GitHub rather than trusting
      // anything the admin's client sent beyond the issue number itself
      // (rule 15) — this is the "backend has independently re-verified"
      // step sql/010's header comment describes.
      const accessToken = await getValidGithubAccessToken(supabase, env, admin.id);
      const issue = await fetchRepositoryIssue(
        accessToken,
        repoRef.owner,
        repoRef.repo,
        bodyResult.data.issueNumber,
      );
      if (!issue) {
        return mapTaskOnboardingError(
          c,
          new TaskOnboardingError(
            "issue_not_found",
            "This issue doesn't exist on GitHub, or isn't a selectable issue",
          ),
        );
      }

      const updatedDraft = await selectTaskOnboardingIssue(supabase, admin.id, draftIdResult.data, issue);
      const project = await loadDraftProject(supabase, updatedDraft.project_id);

      return c.json(toTaskOnboardingDraft(updatedDraft, project), 200);
    } catch (err) {
      if (err instanceof TaskOnboardingError) return mapTaskOnboardingError(c, err);
      if (err instanceof GitHubRepoError) return mapGithubError(c, err);
      logger.error("admin_task_onboarding_select_issue_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't select this issue right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 3 — PATCH /admin/tasks/onboarding/:id/issue-information
 * ---------------------------------------------------------------------- */

const issueInformationSchema = z
  .object({
    choice: z.enum(["EXISTING", "CUSTOM"]),
    customDescription: z.string().trim().max(20_000).optional(),
  })
  .refine((val) => val.choice !== "CUSTOM" || !!val.customDescription?.trim(), {
    message: "Custom information is required when choosing custom information",
    path: ["customDescription"],
  });

adminTaskOnboarding.patch(
  "/:id/issue-information",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:tasks:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as this file's other routes.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const draftIdResult = draftIdSchema.safeParse(c.req.param("id"));
    if (!draftIdResult.success) {
      return errorResponse(c, 400, "invalid_request", draftIdResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-task-onboarding-issue-information",
      limit: 30,
      windowSeconds: 300,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    const bodyResult = issueInformationSchema.safeParse(await c.req.json().catch(() => null));
    if (!bodyResult.success) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        bodyResult.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    try {
      const supabase = getSupabase(env);

      const updatedDraft = await saveTaskIssueInformation(
        supabase,
        admin.id,
        draftIdResult.data,
        bodyResult.data.choice,
        bodyResult.data.choice === "CUSTOM" ? bodyResult.data.customDescription ?? null : null,
      );
      const project = await loadDraftProject(supabase, updatedDraft.project_id);

      return c.json(toTaskOnboardingDraft(updatedDraft, project), 200);
    } catch (err) {
      if (err instanceof TaskOnboardingError) return mapTaskOnboardingError(c, err);
      logger.error("admin_task_onboarding_issue_information_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't save issue information right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 4 — PATCH /admin/tasks/onboarding/:id/tech-stack
 * ---------------------------------------------------------------------- */

adminTaskOnboarding.patch(
  "/:id/tech-stack",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:tasks:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as this file's other routes.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const draftIdResult = draftIdSchema.safeParse(c.req.param("id"));
    if (!draftIdResult.success) {
      return errorResponse(c, 400, "invalid_request", draftIdResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-task-onboarding-tech-stack",
      limit: 30,
      windowSeconds: 300,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    // No request body — "Attach to Task Onboarding" always re-reads the
    // draft's own project rather than accepting a tech stack the client
    // could supply directly (rule 15), matching the frontend's own
    // `attachTechStack(draftId)`, which sends no body.

    try {
      const supabase = getSupabase(env);

      // Load the draft first purely to find which project's tech stack to
      // read — `attachTaskOnboardingTechStack` below re-validates
      // ownership and editability itself before writing anything (rule
      // 15: never trust an earlier read as authorization for the write
      // that follows), same pattern as the Step 2 issue-selection route
      // above.
      const draft = await getTaskOnboardingDraftForAdmin(supabase, draftIdResult.data, admin.id);
      if (!draft) {
        return mapTaskOnboardingError(
          c,
          new TaskOnboardingError("not_found", "Task onboarding draft not found"),
        );
      }
      if (draft.completed_task_id) {
        return mapTaskOnboardingError(
          c,
          new TaskOnboardingError(
            "already_completed",
            "This task onboarding draft has already been completed and can no longer be edited",
          ),
        );
      }

      const techStack = await getProjectTechStack(supabase, draft.project_id);
      if (!techStack) {
        return mapTaskOnboardingError(
          c,
          new TaskOnboardingError(
            "project_ineligible",
            "This draft's project is no longer available — it may have been deleted",
          ),
        );
      }

      const updatedDraft = await attachTaskOnboardingTechStack(
        supabase,
        admin.id,
        draftIdResult.data,
        techStack,
      );
      const project = await loadDraftProject(supabase, updatedDraft.project_id);

      return c.json(toTaskOnboardingDraft(updatedDraft, project), 200);
    } catch (err) {
      if (err instanceof TaskOnboardingError) return mapTaskOnboardingError(c, err);
      logger.error("admin_task_onboarding_tech_stack_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't attach the project tech stack right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 5 — PATCH /admin/tasks/onboarding/:id/difficulty
 * ---------------------------------------------------------------------- */

/**
 * Reuses `devtunnel.users.developer_role` / `experience_level`'s exact
 * enum values verbatim (see src/routes/auth.ts `onboardingSchema`) —
 * "Use the exact difficulty values already defined by the current
 * source/schema if they exist" — rather than a second vocabulary.
 */
const curationSchema = z.object({
  role: z.enum(["FRONTEND", "BACKEND", "FULL_STACK", "DOCUMENTATION", "TESTING", "DEVOPS"]),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
});

adminTaskOnboarding.patch(
  "/:id/difficulty",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:tasks:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as this file's other routes.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const draftIdResult = draftIdSchema.safeParse(c.req.param("id"));
    if (!draftIdResult.success) {
      return errorResponse(c, 400, "invalid_request", draftIdResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-task-onboarding-difficulty",
      limit: 30,
      windowSeconds: 300,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    const bodyResult = curationSchema.safeParse(await c.req.json().catch(() => null));
    if (!bodyResult.success) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        bodyResult.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    try {
      const supabase = getSupabase(env);

      const updatedDraft = await saveTaskCuration(
        supabase,
        admin.id,
        draftIdResult.data,
        bodyResult.data.role,
        bodyResult.data.difficulty,
      );
      const project = await loadDraftProject(supabase, updatedDraft.project_id);

      return c.json(toTaskOnboardingDraft(updatedDraft, project), 200);
    } catch (err) {
      if (err instanceof TaskOnboardingError) return mapTaskOnboardingError(c, err);
      logger.error("admin_task_onboarding_difficulty_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't save the role and difficulty right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 6 — GET /admin/tasks/onboarding/:id/preview
 * ---------------------------------------------------------------------- */

adminTaskOnboarding.get(
  "/:id/preview",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:tasks:read"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as this file's other routes.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const draftIdResult = draftIdSchema.safeParse(c.req.param("id"));
    if (!draftIdResult.success) {
      return errorResponse(c, 400, "invalid_request", draftIdResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-task-onboarding-preview",
      limit: 60,
      windowSeconds: 60,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    try {
      const supabase = getSupabase(env);
      const updatedDraft = await markTaskPreviewCompleted(supabase, admin.id, draftIdResult.data);
      const project = await loadDraftProject(supabase, updatedDraft.project_id);

      return c.json(toTaskOnboardingDraft(updatedDraft, project), 200);
    } catch (err) {
      if (err instanceof TaskOnboardingError) return mapTaskOnboardingError(c, err);
      logger.error("admin_task_onboarding_preview_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load the task preview right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Step 7 — POST /admin/tasks/onboarding/:id/validate
 * ---------------------------------------------------------------------- */

adminTaskOnboarding.post(
  "/:id/validate",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:tasks:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as this file's other routes.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const draftIdResult = draftIdSchema.safeParse(c.req.param("id"));
    if (!draftIdResult.success) {
      return errorResponse(c, 400, "invalid_request", draftIdResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-task-onboarding-validate",
      limit: 60,
      windowSeconds: 60,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    try {
      const supabase = getSupabase(env);
      const draft = await getTaskOnboardingDraftForAdmin(supabase, draftIdResult.data, admin.id);
      if (!draft) {
        return errorResponse(c, 404, "task_onboarding_draft_not_found", "Task onboarding draft not found");
      }
      if (draft.completed_task_id) {
        return errorResponse(
          c,
          409,
          "task_onboarding_already_completed",
          "This task onboarding draft has already been completed",
        );
      }

      const result = computeTaskOnboardingValidation(draft);
      await saveTaskValidationResult(supabase, admin.id, draftIdResult.data, result.valid);
      return c.json(result, 200);
    } catch (err) {
      logger.error("admin_task_onboarding_validate_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't validate the task onboarding draft right now");
    }
  },
);

/* ---------------------------------------------------------------------- *
 * Section 12 — POST /admin/tasks/onboarding/:id/complete
 * ---------------------------------------------------------------------- */

adminTaskOnboarding.post(
  "/:id/complete",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:tasks:write"),
  async (c) => {
    const env = getEnv(c.env);
    const admin = c.get("user");
    if (!admin) {
      // requireAuth + requireAdminRole already guarantee this — kept for
      // type safety, same pattern as this file's other routes.
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    const draftIdResult = draftIdSchema.safeParse(c.req.param("id"));
    if (!draftIdResult.success) {
      return errorResponse(c, 400, "invalid_request", draftIdResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-task-onboarding-complete",
      limit: 10,
      windowSeconds: 300,
    });
    if (!withinLimit) return errorResponse(c, 429, "rate_limited", "Too many requests.");

    try {
      const supabase = getSupabase(env);
      const task = await completeTaskOnboarding(supabase, admin.id, draftIdResult.data);

      // rule 96: audit important administrative actions. Best-effort —
      // must never fail a request that already succeeded (same posture
      // as src/routes/projectOnboarding.ts's own /complete route).
      recordAdminAudit(supabase, {
        adminId: admin.id,
        action: "TASK_ONBOARDING_COMPLETED",
        resourceType: "task",
        resourceId: task.id,
        result: "SUCCESS",
        metadata: { draftId: draftIdResult.data, slug: task.slug, projectSlug: task.projectSlug },
      }).catch((auditErr) =>
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        }),
      );

      return c.json(task, 201);
    } catch (err) {
      if (err instanceof TaskOnboardingError) return mapTaskOnboardingError(c, err);
      logger.error("admin_task_onboarding_complete_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't create the task right now");
    }
  },
);