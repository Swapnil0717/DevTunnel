import type { UserRole } from "../types";

/**
 * RBAC permission engine.
 *
 * devtunnel_workflow.txt section 43 ("Admin Backend") specifies:
 *   Algorithm: RBAC + API authorization
 *   Why: The frontend being separate is not enough; the backend must
 *        independently verify every admin request.
 *   What it should do: Admin Request -> Authentication -> Admin Role
 *        Check -> Permission Check -> API Operation
 *
 * This module implements the "Permission Check" step. It is deliberately
 * permission-based rather than a single `role === "ADMIN"` check scattered
 * across route files (Backend_Development_Rules.txt rule 12: authorization
 * must be explicit — "logged in = authorized" is exactly the shortcut that
 * rule forbids, and "role is ADMIN = authorized for everything" is the same
 * shortcut one level up). Every admin route declares the specific
 * permission it needs (see src/routes/admin/*.ts and
 * src/middleware/adminAuth.ts's `requirePermission`), and this file is the
 * single place that decides which roles hold which permissions. Adding a
 * new role, or narrowing what today's ADMIN role can do, only ever means
 * editing `ROLE_PERMISSIONS` here — no route file has to change.
 *
 * Route <-> permission mapping this is designed against
 * (devtunnel_workflow.txt section 43's route list):
 *
 *   GET   /admin/auth/me                -> (role gate only, no extra permission)
 *   GET   /admin/projects                -> admin:projects:read
 *   GET   /admin/projects/:id            -> admin:projects:read
 *   POST  /admin/projects                -> admin:projects:write
 *   PATCH /admin/projects/:id            -> admin:projects:write
 *   DELETE /admin/projects/:id           -> admin:projects:delete
 *   GET   /admin/projects/:id/files      -> admin:projects:files:read
 *   POST  /admin/projects/:id/tasks      -> admin:projects:tasks:write
 *   POST  /admin/projects/:id/author     -> admin:projects:author:write
 *   POST  /admin/projects/:id/publish    -> admin:projects:publish
 *   POST  /admin/projects/:id/unpublish  -> admin:projects:publish
 *   POST  /admin/github                  -> admin:github:sync
 *   GET   /admin/activity                -> admin:activity:read
 *
 *   GET   /admin/tasks/onboarding/projects -> admin:tasks:read
 *   POST  /admin/tasks/onboarding          -> admin:tasks:write
 *   PATCH /admin/tasks/onboarding/:id/issue             -> admin:tasks:write
 *   PATCH /admin/tasks/onboarding/:id/issue-information -> admin:tasks:write
 *   PATCH /admin/tasks/onboarding/:id/tech-stack        -> admin:tasks:write
 *   PATCH /admin/tasks/onboarding/:id/difficulty        -> admin:tasks:write
 *   GET   /admin/projects/:id/github/issues -> admin:projects:github:read
 *   GET   /admin/projects/:id/tech-stack    -> admin:projects:read
 *
 * `admin:tasks:read` / `admin:tasks:write` back admin_workflow.txt section
 * 10's Task Onboarding wizard (today: Step 1 — "Project Selection", Step 2
 * — "Select Existing Issue", Step 3 — "Issue Information", Step 4 —
 * "Fetch Project Tech Stack", and Step 5 — "Difficulty",
 * src/routes/taskOnboarding.ts) and are named to match the existing
 * `admin:projects:read` / `admin:projects:write` pair so the later
 * `/admin/tasks` (all tasks) and remaining Task Onboarding step routes
 * plug into these same two permissions rather than each declaring a new
 * one — same reasoning as `admin:projects:*` above.
 *
 * `admin:projects:github:read` is its own, narrower permission — not
 * folded into `admin:projects:read` — because it reaches out to the
 * GitHub API on every call (unlike every other `admin:projects:read`
 * route, which only reads DevTunnel's own database) and is the same
 * "different blast radius gets its own permission" reasoning already
 * applied to `admin:projects:delete` above. `GET
 * /admin/projects/:id/tech-stack`, by contrast, only ever reads
 * `devtunnel.projects` — no GitHub call — so it uses plain
 * `admin:projects:read` rather than the GitHub-scoped permission.
 *
 * `GET /admin/auth/me`, `GET /admin/activity`, `GET /admin/projects/:id/
 * github/issues`, `GET /admin/projects/:id/tech-stack`, and the Task
 * Onboarding Steps 1–5 routes are implemented as of this module (Admin
 * Backend: authentication + authorization + RBAC). The rest of the
 * permission list above exists now so future admin route modules
 * (project/task/author/publish/GitHub-sync endpoints) plug into the same
 * RBAC engine instead of each inventing its own role check.
 */
export const ADMIN_PERMISSIONS = [
  "admin:projects:read",
  "admin:projects:write",
  "admin:projects:delete",
  "admin:projects:publish",
  "admin:projects:files:read",
  "admin:projects:tasks:write",
  "admin:projects:author:write",
  "admin:projects:github:read",
  "admin:tasks:read",
  "admin:tasks:write",
  "admin:github:sync",
  "admin:activity:read",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/**
 * Every role declared in `UserRole` (src/types.ts) must have an entry
 * here, even an empty one. A role missing from this map would fail closed
 * anyway (`hasPermission` returns `false` for an unknown role via `?.`),
 * but listing it explicitly documents that "this role gets no admin
 * permissions" was a deliberate decision, not an oversight — the same
 * "explicit over implicit" posture rule 12 asks for.
 *
 * Today only `ADMIN` holds any admin permission, matching
 * devtunnel_workflow.txt's "Private Admin Portal" being restricted to
 * admin accounts. `MAINTAINER` is intentionally still empty: maintaining a
 * project (`devtunnel.project_maintainers`) is a different, narrower
 * capability than platform administration, and is authorized separately
 * (ownership/maintainer checks on the maintainer-facing project routes,
 * not this RBAC table) — see db/devtunnelStats.ts `getIsMaintainer`.
 */
const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<AdminPermission>> = {
  CONTRIBUTOR: new Set(),
  MAINTAINER: new Set(),
  ADMIN: new Set(ADMIN_PERMISSIONS),
};

/** Whether `role` grants `permission`. Unknown roles fail closed (deny). */
export function hasPermission(role: UserRole, permission: AdminPermission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

/**
 * All permissions granted to `role`, as a plain array (stable order,
 * following `ADMIN_PERMISSIONS`'s declaration order).
 *
 * Used by `GET /admin/auth/me` so the admin frontend can show/hide UI
 * without re-implementing this table client-side. This does not weaken
 * rule 10 ("backend is the final security boundary") — the backend is
 * simply *telling* the frontend the answer it already computed; every
 * mutating admin route still calls `hasPermission` / `requirePermission`
 * itself and never trusts what the frontend renders.
 */
export function permissionsForRole(role: UserRole): AdminPermission[] {
  return Array.from(ROLE_PERMISSIONS[role] ?? []);
}