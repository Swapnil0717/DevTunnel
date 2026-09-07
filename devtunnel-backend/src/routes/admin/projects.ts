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
import { getAdminProjectById, listAdminProjects } from "../../db/adminProjects";

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
 * `GET /admin/projects/:id` (admin_workflow.txt section 22).
 *
 * Single-project detail backing the table's "View" action (section 4).
 * Same `AdminProjectSummary` shape as the list, kept consistent for one
 * caller-side type; a richer detail payload (README, tech stack, full
 * contributor lists) belongs to the separate, not-yet-requested
 * `/admin/projects/:id/contributors` and `/admin/projects/:id/repository`
 * routes (section 22).
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
      const project = await getAdminProjectById(supabase, idResult.data);
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