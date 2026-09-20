import type { AuthUser } from "./types";

/**
 * Single source of truth for "does this signed-in person have admin
 * access" (devtunnel_workflow.txt, Module A1 — Admin Authentication:
 * "Role-based access control (RBAC)").
 *
 * Backed entirely by `AuthUser.role`, which mirrors `devtunnel.users.role`
 * and is only ever set server-side. There is no separate admin login
 * mechanism — the Admin Portal uses the exact same GitHub OAuth flow as
 * the main site (devtunnel-backend/src/routes/auth.ts has one `/auth/*`
 * surface, not two); what makes a sign-in an *admin* sign-in is this role
 * check running against the destination, not a different credential.
 *
 * This is a UI-layer convenience only, same caveat as
 * lib/auth/session.ts: the frontend never trusts itself as the security
 * boundary. `/admin/(protected)/layout.tsx` re-checks this on every
 * request against the backend-verified session, and the backend must
 * independently authorize every `/admin/*` API call regardless of what
 * this returns (rule 18 / rule 43 in devtunnel_workflow.txt Module 43 —
 * Admin Backend: "the frontend being separate is not enough").
 */
export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === "ADMIN";
}