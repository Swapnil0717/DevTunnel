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
import { listAdminAuditLog } from "../../db/adminAudit";

export const adminActivity = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Query validation for `GET /admin/activity` (rules 14–15: every input is
 * validated server-side, never trusted from the client). `limit` is
 * capped at 100 to bound response size and query cost; `before` is a
 * keyset cursor and must be a real ISO timestamp, not an arbitrary string,
 * to keep the `created_at < before` query well-formed.
 */
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  before: z.string().datetime({ offset: true }).optional(),
});

/**
 * `GET /admin/activity` (devtunnel_workflow.txt section 43).
 *
 * Read-only, keyset-paginated view over `devtunnel.admin_audit_log`
 * (sql/005_add_admin_audit_log.sql). Every row currently in that table is
 * written by `requireAdminRole`/`requirePermission`
 * (src/middleware/adminAuth.ts) recording denied admin/permission checks;
 * future admin modules that perform state-changing actions (publishing a
 * project, editing an author, syncing GitHub) will add their own audit
 * writes via src/db/adminAudit.ts `recordAdminAudit` (rule 96: audit
 * important administrative actions).
 *
 * Gated by both the admin role (`requireAdminRole`) and the specific
 * `admin:activity:read` RBAC permission (`requirePermission`) — this is
 * the route the RBAC engine (src/lib/rbac.ts) was written to demonstrate:
 * "is an admin" and "may read the audit log" are checked as two separate,
 * explicit decisions (rule 12), even though today every admin account
 * holds both.
 *
 * Response: { data: { entries: AdminAuditEntry[], nextCursor: string | null } }
 */
adminActivity.get(
  "/",
  requireAuth,
  requireAdminRole,
  requirePermission("admin:activity:read"),
  async (c) => {
    const env = getEnv(c.env);

    const withinLimit = await checkRateLimit(c, {
      bucket: "admin-activity-list",
      limit: 60,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests.");
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
      const { entries, nextCursor } = await listAdminAuditLog(supabase, {
        limit: parsed.data.limit,
        before: parsed.data.before ?? null,
      });
      return c.json({ data: { entries, nextCursor } }, 200);
    } catch (err) {
      logger.error("admin_activity_list_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't load admin activity right now");
    }
  },
);