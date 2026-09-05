import { Hono } from "hono";
import type { Env, Variables } from "../../types";
import { requireAuth } from "../../middleware/auth";
import { requireAdminRole } from "../../middleware/adminAuth";
import { checkRateLimit } from "../../lib/rateLimit";
import { errorResponse } from "../../lib/response";
import { permissionsForRole } from "../../lib/rbac";

export const adminAuth = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * `GET /admin/auth/me` (devtunnel_workflow.txt section 43 — `/admin/auth`).
 *
 * The admin portal's own "am I signed in and allowed into the admin area"
 * check — the admin-side counterpart to `GET /auth/me` on the main site.
 * Deliberately its own endpoint rather than reusing `/auth/me`, because
 * the admin frontend needs a real 401 (not signed in) vs 403 (signed in,
 * not an admin) vs 200 (admin) distinction, and must never infer admin
 * access from a 200 on some unrelated route
 * (Backend_Development_Rules.txt rule 94: never protect an admin endpoint
 * only by hiding it from the frontend — the frontend gets a definitive
 * server-verified answer instead).
 *
 * `requireAuth` resolves identity (admin authentication); `requireAdminRole`
 * enforces the role gate (admin authorization). Both must pass before this
 * handler runs at all.
 *
 * `permissions` is the RBAC engine's own answer (src/lib/rbac.ts) for
 * `user.role`, included so the admin frontend can show/hide actions
 * without re-implementing the permission table client-side. This does not
 * relax rule 10 — every mutating admin route still calls
 * `requirePermission` itself server-side; the frontend is only ever told
 * the answer, never trusted to decide it.
 *
 * Response: { data: { admin: {...}, permissions: string[] } }
 */
adminAuth.get("/me", requireAuth, requireAdminRole, async (c) => {
  const withinLimit = await checkRateLimit(c, {
    bucket: "admin-auth-me",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests.");
  }

  const user = c.get("user");
  if (!user) {
    // requireAuth + requireAdminRole already guarantee this — kept for
    // type safety, same pattern as routes/auth.ts PATCH /auth/onboarding.
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  return c.json(
    {
      data: {
        admin: {
          id: user.id,
          email: user.email,
          username: user.username,
          name: user.name,
          avatarUrl: user.avatarUrl,
          role: user.role,
        },
        permissions: permissionsForRole(user.role),
      },
    },
    200,
  );
});