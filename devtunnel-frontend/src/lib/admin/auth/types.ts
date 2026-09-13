import type { UserRole } from "@/lib/auth/types";

/**
 * Local, frontend-only shapes for `GET /admin/auth/me`
 * (devtunnel-backend/src/routes/admin/auth.ts) — the admin portal's own
 * "am I signed in and allowed into the admin area" check, distinct from
 * the generic `GET /auth/me` the main site uses
 * (see that route's own doc comment for why it's a separate endpoint:
 * a real 401 vs. 403 vs. 200 distinction, never inferred from a 200 on
 * some unrelated route).
 *
 * `admin` is trimmed to exactly the fields the route returns — a subset
 * of the full `AuthUser` shape (`lib/auth/types.ts`), not the whole
 * profile.
 */
export interface AdminAuthMeAdmin {
  id: string;
  email: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  role: UserRole;
}

/**
 * `permissions` is the RBAC engine's own answer (devtunnel-backend
 * `src/lib/rbac.ts` `permissionsForRole`) for `admin.role` — every
 * `admin:*` permission string this admin actually holds, e.g.
 * `"admin:projects:write"`, `"admin:ai:write"`. This exists so the
 * frontend can show/hide admin actions without re-implementing the
 * permission table client-side — it does not relax the rule that every
 * mutating admin route still calls `requirePermission` itself
 * server-side; this is only ever the answer, never the decision.
 */
export interface AdminAuthMe {
  admin: AdminAuthMeAdmin;
  permissions: string[];
}