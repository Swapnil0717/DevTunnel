import { Hono } from "hono";
import { z } from "zod";
import type { AdminTaskUpdatePayload, Env, Variables } from "../../types";
import { getEnv } from "../../config/env";
import { getSupabase } from "../../lib/supabase";
import { requireAuth } from "../../middleware/auth";
import { requireAdminRole, requirePermission } from "../../middleware/adminAuth";
import { checkRateLimit } from "../../lib/rateLimit";
import { errorResponse } from "../../lib/response";
import { logger } from "../../lib/logger";
import {
  AdminTaskDeleteError,
  AdminTaskUpdateError,
  deleteAdminTask,
  getAdminTaskDetailById,
  listAdminTasks,
  updateAdminTask,
} from "../../db/adminTasks";
import { recordAdminAudit } from "../../db/adminAudit";

/**
 * Admin — Tasks (admin_workflow.txt section 8 — "Task Section"; section
 * 13 — "Task Page"; section 22 — Admin Backend API Map, "Tasks":
 * `GET /admin/tasks`, `GET /admin/tasks/:id`, `PATCH /admin/tasks/:id`,
 * `DELETE /admin/tasks/:id`). RBAC permissions `admin:tasks:read` /
 * `admin:tasks:write` / `admin:tasks:delete` (src/lib/rbac.ts). Mounted
 * at `/admin/tasks` in src/routes/admin/index.ts, alongside (not
 * instead of) `/admin/tasks/onboarding`
 * (src/routes/taskOnboarding.ts) — the two modules are independent:
 * onboarding drafts vs. already-active tasks, same relationship
 * `/admin/projects` has with `/admin/projects/onboarding`. Hono's router
 * matches the literal `onboarding` path segment ahead of this module's
 * `/:id` dynamic segment regardless of mount order (see
 * src/routes/admin/index.ts's own comment), so
 * `GET /admin/tasks/onboarding/...` can never be swallowed by the `:id`
 * route below.
 */
export const adminTasks = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Query validation for `GET /admin/tasks` (rules 14–15: every input is
 * validated server-side). `limit` is capped to bound response size/query
 * cost; `before` is a keyset cursor and must be a real ISO timestamp so
 * the `created_at < before` query stays well-formed. The already-shipped
 * frontend (`getAdminTasks` in devtunnel-frontend/src/lib/admin/tasks/
 * api.ts) calls this with no query params at all and expects every task
 * back in one response (filtering happens client-side in
 * `AdminTasksExplorer`) — `limit` defaults generously high enough to
 * cover that today while still enforcing a real server-side ceiling
 * (rule 41: the client must never control resource consumption without
 * limits).
 */
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
  before: z.string().datetime({ offset: true }).optional(),
});

const idSchema = z.string().uuid("Invalid task id");

/**
 * Body validation for `PATCH /admin/tasks/:id` (section 22). Deliberately
 * mirrors, field for field, `AdminTaskUpdatePayload` (src/types.ts) and
 * the exact role/difficulty enums Task Onboarding's own Step 5
 * (`curationSchema`, src/routes/taskOnboarding.ts) already validates —
 * never a second, drifting vocabulary for the same concept.
 *
 * `.refine` at the top level requires at least one field to be present —
 * an empty `{}` body is rejected as a 400 rather than silently accepted
 * as a no-op PATCH (rule 17: don't paper over a caller mistake as
 * success), same posture `updateProjectSchema` takes in
 * src/routes/admin/projects.ts.
 */
const updateTaskSchema = z
  .object({
    roles: z
      .array(z.enum(["FRONTEND", "BACKEND", "FULL_STACK", "DOCUMENTATION", "TESTING", "DEVOPS"]))
      .min(1, "Select at least one role")
      .max(6)
      .optional(),
    difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
    customDescription: z.string().trim().max(20_000).nullable().optional(),
    status: z.enum(["OPEN", "IN_PROGRESS", "DONE"]).optional(),
  })
  .refine(
    (val) =>
      val.roles !== undefined ||
      val.difficulty !== undefined ||
      val.customDescription !== undefined ||
      val.status !== undefined,
    { message: "Provide at least one field to update" },
  );

/**
 * Body validation for `DELETE /admin/tasks/:id`. `reason` is optional and
 * free-text — stored verbatim on `devtunnel.tasks.delete_reason`
 * (sql/013) for the audit trail, never parsed or branched on. Capped well
 * under any column/log size concern (rule 59: never let unbounded
 * user-controlled text flow into storage or logs unchecked).
 */
const deleteBodySchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
});

/**
 * `GET /admin/tasks` (admin_workflow.txt section 8/13 — "Task Section" /
 * "Task Page"; section 22).
 *
 * "This page shows all tasks/issues that DevTunnel currently provides to
 * contributors." Returns every DevTunnel task (each row backed by
 * `devtunnel.admin_task_list`, sql/013), newest first — including
 * soft-deleted tasks (section 15's "Deleted in DevTunnel" view is the
 * same underlying list, split client-side on `deletedAt` by the
 * already-shipped `AdminTasksExplorer`).
 *
 * Response body is the raw `AdminTaskSummary[]` array — NOT wrapped in
 * the `{ data: ... }` envelope (src/lib/response.ts) — to match the
 * already-shipped frontend contract in devtunnel-frontend/src/lib/admin/
 * tasks/api.ts (`const data = (await res.json()) as AdminTaskSummary[]`),
 * the same documented exception already used for `GET /admin/projects`
 * (src/routes/admin/projects.ts). Error responses still use the standard
 * `{ error: { code, message, requestId } }` envelope.
 *
 * Keyset pagination cursor (rule 40/41: pagination is mandatory for
 * large collections) is returned via the `X-Next-Cursor` response header
 * — present only when another page exists — for the same reason
 * `GET /admin/projects` does this: the body must stay a plain array to
 * match the shipped contract, and today's frontend fetches once with no
 * query params.
 */
adminTasks.get(
  "/",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:tasks:read"),
  async (c) => {
    const env = getEnv(c.env);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-tasks-list",
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
      const { tasks, nextCursor } = await listAdminTasks(supabase, {
        limit: parsed.data.limit,
        before: parsed.data.before ?? null,
      });

      if (nextCursor) {
        c.header("X-Next-Cursor", nextCursor);
      }
      return c.json(tasks, 200);
    } catch (err) {
      logger.error("admin_tasks_list_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load tasks right now");
    }
  },
);

/**
 * `GET /admin/tasks/:id` (admin_workflow.txt section 13's "View task"
 * action; A14 — "Task Details" in the final page list, section 29: "Task
 * + contributor/submission data").
 *
 * Backs the whole Task Detail page
 * (devtunnel-frontend/src/app/admin/(protected)/tasks/[id]/page.tsx) —
 * returns `AdminTaskDetail` (src/types.ts), matching the frontend's
 * already-shipped contract in devtunnel-frontend/src/lib/admin/tasks/
 * types.ts exactly. A soft-deleted task's detail route 404s (section 15:
 * its DevTunnel representation is gone, even though it still legitimately
 * appears in `GET /admin/tasks`'s "Deleted in DevTunnel" view) — see
 * `getAdminTaskDetailById`'s own comment.
 */
adminTasks.get(
  "/:id",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:tasks:read"),
  async (c) => {
    const env = getEnv(c.env);

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-tasks-detail",
      limit: 120,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    try {
      const supabase = getSupabase(env);
      const task = await getAdminTaskDetailById(supabase, idResult.data);
      if (!task) {
        return errorResponse(c, 404, "task_not_found", "Task not found");
      }
      return c.json(task, 200);
    } catch (err) {
      logger.error("admin_task_detail_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load this task right now");
    }
  },
);

/**
 * `PATCH /admin/tasks/:id` (admin_workflow.txt section 22 — Admin
 * Backend API Map, "Tasks"; RBAC permission `admin:tasks:write`).
 *
 * Backs the Task Detail page's inline edit panel
 * (`EditTaskDetailsPanel` / `updateAdminTask` in
 * devtunnel-frontend/src/lib/admin/tasks/client-api.ts) — lets an Admin
 * correct role, difficulty, the custom description layered on the
 * GitHub issue, and the task's own DevTunnel status after the task is
 * already live. Every other field on the task (project, GitHub issue,
 * contributor/submission counts) is GitHub- or backend-derived and has
 * no writable path through this endpoint — see `updateTaskSchema` and
 * `AdminTaskUpdatePayload` (src/types.ts) for exactly what is and isn't
 * accepted.
 *
 * Returns the full, freshly-read `AdminTaskDetail` (not just the changed
 * fields) so the frontend can replace its local state directly from the
 * response without a second round-trip — same contract `updateAdminTask`
 * in client-api.ts already expects.
 */
adminTasks.patch(
  "/:id",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:tasks:write"),
  async (c) => {
    const env = getEnv(c.env);
    const user = c.get("user")!;

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-tasks-update",
      limit: 30,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    const rawBody = await c.req.json().catch(() => null);
    const bodyResult = updateTaskSchema.safeParse(rawBody);
    if (!bodyResult.success) {
      return errorResponse(
        c,
        400,
        "invalid_request",
        bodyResult.error.issues[0]?.message ?? "Invalid request body",
      );
    }

    const supabase = getSupabase(env);

    const updatePayload: AdminTaskUpdatePayload = {};
    if (bodyResult.data.roles !== undefined) updatePayload.roles = bodyResult.data.roles;
    if (bodyResult.data.difficulty !== undefined) updatePayload.difficulty = bodyResult.data.difficulty;
    if (bodyResult.data.customDescription !== undefined) {
      updatePayload.customDescription = bodyResult.data.customDescription;
    }
    if (bodyResult.data.status !== undefined) updatePayload.status = bodyResult.data.status;

    try {
      const task = await updateAdminTask(supabase, idResult.data, updatePayload);

      // Best-effort audit trail (rule 96: audit important administrative
      // actions). Only records *which* fields changed — never the
      // free-text custom description itself (rule 59: don't let
      // unbounded user-controlled text flow into logs/audit rows
      // unchecked).
      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_TASK_UPDATED",
          resourceType: "task",
          resourceId: task.id,
          result: "SUCCESS",
          metadata: {
            slug: task.slug,
            updatedFields: Object.keys(updatePayload),
          },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return c.json(task, 200);
    } catch (err) {
      if (err instanceof AdminTaskUpdateError) {
        if (err.code === "not_found") {
          return errorResponse(c, 404, "task_not_found", "Task not found");
        }
        // deleted
        return errorResponse(c, 409, "task_deleted", err.message);
      }

      logger.error("admin_task_update_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });

      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_TASK_UPDATED",
          resourceType: "task",
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

      return errorResponse(c, 500, "internal_error", "Couldn't update this task right now");
    }
  },
);

/**
 * `DELETE /admin/tasks/:id` (admin_workflow.txt section 22; RBAC
 * permission `admin:tasks:delete`, src/lib/rbac.ts).
 *
 * Section 15 ("Deleted DevTunnel Tasks / Issues") is explicit that this
 * must be a soft delete via `delete_admin_task` (sql/013), never a
 * physical row delete — the GitHub issue this task was onboarded from
 * must remain visible/queryable afterward ("The GitHub issue is not
 * deleted just because the DevTunnel representation is deleted"), and a
 * task can carry real history (contributor assignment, PR submissions)
 * that must survive removal, same reasoning `deleteAdminProject`
 * documents for projects.
 *
 * Idempotency: deleting an already-deleted task returns 409, not a
 * silent 200 — the caller should know their delete didn't do anything
 * (rule 17: don't paper over a no-op as success).
 */
adminTasks.delete(
  "/:id",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:tasks:delete"),
  async (c) => {
    const env = getEnv(c.env);
    const user = c.get("user")!;

    const idResult = idSchema.safeParse(c.req.param("id"));
    if (!idResult.success) {
      return errorResponse(c, 400, "invalid_request", idResult.error.issues[0]!.message);
    }

    // Body is optional — an empty/absent body is a valid delete with no
    // reason recorded, so a JSON parse failure here is treated as "no
    // body" rather than a 400, same convention `DELETE /admin/projects/:id`
    // already uses.
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
    // limited more aggressively (rule 43/85).
    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-tasks-delete",
      limit: 20,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    const supabase = getSupabase(env);

    try {
      const result = await deleteAdminTask(
        supabase,
        user.id,
        idResult.data,
        bodyResult.data.reason ?? null,
      );

      // Best-effort audit trail (rule 96). A failure here must never
      // fail the delete that already succeeded — logged loudly instead
      // (rule 21).
      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_TASK_DELETED",
          resourceType: "task",
          resourceId: result.id,
          result: "SUCCESS",
          metadata: { slug: result.slug, title: result.title, reason: bodyResult.data.reason ?? null },
        });
      } catch (auditErr) {
        logger.error("admin_audit_write_failed", {
          error: auditErr instanceof Error ? auditErr.message : String(auditErr),
          requestId: c.get("requestId"),
        });
      }

      return c.json(result, 200);
    } catch (err) {
      if (err instanceof AdminTaskDeleteError) {
        if (err.code === "not_found") {
          return errorResponse(c, 404, "task_not_found", "Task not found");
        }
        // already_deleted
        return errorResponse(c, 409, "task_already_deleted", err.message);
      }

      logger.error("admin_task_delete_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });

      try {
        await recordAdminAudit(supabase, {
          adminId: user.id,
          action: "ADMIN_TASK_DELETED",
          resourceType: "task",
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

      return errorResponse(c, 500, "internal_error", "Couldn't delete this task right now");
    }
  },
);