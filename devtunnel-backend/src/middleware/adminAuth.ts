import type { Context, MiddlewareHandler } from "hono";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { hasPermission, type AdminPermission } from "../lib/rbac";
import { recordAdminAudit } from "../db/adminAudit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";

/**
 * Admin authorization (devtunnel_workflow.txt section 43 — "Admin
 * Request -> Authentication -> Admin Role Check -> Permission Check ->
 * API Operation").
 *
 * `requireAuth` (src/middleware/auth.ts) already answers "who is making
 * this request" (admin authentication — session cookie, resolved
 * server-side, rule 11). Every `/admin/*` route mounts BOTH middlewares,
 * in this order:
 *
 *   admin.get("/some-route", requireAuth, requireAdminRole, handler)
 *
 * so authentication and authorization stay two separate, independently
 * testable steps (rule 12) rather than one combined check. `requireAuth`
 * must always run first — `requireAdminRole` only reads `c.get("user")`,
 * it does not itself look up the session.
 *
 * Never rely on a route simply not being linked from the admin frontend to
 * keep it private (rule 94: protect admin endpoints aggressively, never
 * only by hiding them from the UI) — this middleware is the actual
 * boundary.
 */
export const requireAdminRole: MiddlewareHandler<{ Bindings: Env; Variables: Variables }> = async (
  c,
  next,
) => {
  const user = c.get("user");
  if (!user) {
    // Defensive only — requireAuth is expected to have already rejected
    // an unauthenticated request with 401 before this middleware runs.
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  if (user.role !== "ADMIN") {
    logger.warn("admin_access_denied", {
      userId: user.id,
      role: user.role,
      method: c.req.method,
      path: c.req.path,
      requestId: c.get("requestId"),
    });
    await auditDenied(c, user.id, "ADMIN_ACCESS_DENIED", "route", c.req.path, {
      method: c.req.method,
      role: user.role,
    });
    return errorResponse(c, 403, "forbidden", "Admin access required");
  }

  await next();
};

/**
 * Fine-grained RBAC permission check (the "Permission Check" step in
 * devtunnel_workflow.txt section 43's algorithm, implemented by
 * src/lib/rbac.ts). Mount after both `requireAuth` and `requireAdminRole`
 * on any admin route that needs a specific capability rather than just
 * "is an admin", e.g.:
 *
 *   admin.get(
 *     "/activity",
 *     requireAuth,
 *     requireAdminRole,
 *     requirePermission("admin:activity:read"),
 *     handler,
 *   )
 *
 * Kept separate from `requireAdminRole` deliberately: today every admin
 * account has every admin permission (src/lib/rbac.ts), so the two checks
 * always agree — but routes already declare the permission they actually
 * need, so introducing a narrower admin role later (e.g. a read-only
 * admin) is a one-line change in rbac.ts, not a rewrite of every route.
 */
export function requirePermission(
  permission: AdminPermission,
): MiddlewareHandler<{ Bindings: Env; Variables: Variables }> {
  return async (c, next) => {
    const user = c.get("user");
    if (!user) {
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }

    if (!hasPermission(user.role, permission)) {
      logger.warn("admin_permission_denied", {
        userId: user.id,
        role: user.role,
        permission,
        method: c.req.method,
        path: c.req.path,
        requestId: c.get("requestId"),
      });
      await auditDenied(c, user.id, "ADMIN_PERMISSION_DENIED", "permission", permission, {
        method: c.req.method,
        path: c.req.path,
      });
      return errorResponse(c, 403, "forbidden", "You don't have permission to perform this action");
    }

    await next();
  };
}

/**
 * Best-effort audit trail for denied admin attempts (rule 96: audit
 * important administrative actions — a rejected admin/permission check is
 * itself security-relevant, arguably more so than a routine success). A
 * failure writing this row must never fail the request that's already
 * being correctly rejected with 403 — it's logged loudly instead (rule 21)
 * and swallowed, mirroring the non-fatal best-effort writes elsewhere in
 * this codebase (src/db/sessions.ts `last_used_at` touch,
 * src/routes/auth.ts GitHub token persistence).
 */
async function auditDenied(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  adminId: string,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const env = getEnv(c.env);
    const supabase = getSupabase(env);
    await recordAdminAudit(supabase, {
      adminId,
      action,
      resourceType,
      resourceId,
      result: "DENIED",
      metadata,
    });
  } catch (err) {
    logger.error("admin_audit_write_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
  }
}