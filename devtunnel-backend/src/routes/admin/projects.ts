import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../../types";
import { getEnv } from "../../config/env";
import { getSupabase } from "../../lib/supabase";
import { requireAuth } from "../../middleware/auth";
import { requireAdminRole, requirePermission } from "../../middleware/adminAuth";
import { checkRateLimit } from "../../lib/rateLimit";
import { errorResponse } from "../../lib/response";
import { logger } from "../../lib/logger";
import {
  AdminProjectDeleteError,
  deleteAdminProject,
  getAdminProjectDetailById,
  listAdminProjects,
} from "../../db/adminProjects";
import { recordAdminAudit } from "../../db/adminAudit";

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