// devtunnel-backend/src/routes/taskOnboarding.ts

import { Hono } from "hono";
import { z } from "zod";
import { getEnv } from "../config/env";
import {
  TaskOnboardingError,
  listEligibleTaskOnboardingProjects,
  selectTaskOnboardingProject,
  toTaskOnboardingDraft,
} from "../db/taskOnboarding";
import { logger } from "../lib/logger";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { getSupabase } from "../lib/supabase";
import { requireAdminRole, requirePermission } from "../middleware/adminAuth";
import { requireAuth } from "../middleware/auth";
import { Env, Variables } from "../types";

/**
 * Admin — Task Onboarding wizard (admin_workflow.txt section 10 — "Create
 * Task — Task Onboarding"; backend routes per section 22's "Task
 * onboarding" group). Only **Step 1 — Project Selection** is implemented
 * here; Steps 2–7 (issue selection, issue information, tech-stack
 * attachment, difficulty/role curation, preview, final validation,
 * completion) are separate, not-yet-built routes that will extend this
 * same draft (sql/009's header comment) — this file does not stub them
 * out, per Backend_Development_Rules.txt rule 5 ("never invent
 * implementation beyond what's actually being built").
 *
 * Every route here requires admin authentication + role (mounted the
 * same way as every other admin module — see src/routes/admin/index.ts)
 * plus the `admin:tasks:read`/`admin:tasks:write` RBAC permission
 * src/lib/rbac.ts reserves for task routes.
 *
 * Response bodies intentionally return the `TaskOnboardingProjectOption[]`
 * / `TaskOnboardingDraft` object directly — NOT wrapped in the `{ data:
 * ... }` envelope used elsewhere in this backend (src/lib/response.ts) —
 * to match the already-implemented frontend contract in
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
    default:
      return errorResponse(c, 409, "task_onboarding_conflict", err.message);
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