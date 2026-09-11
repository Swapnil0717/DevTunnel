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
 *   GET   /admin/new-issues              -> admin:new-issues:read
 *   POST  /admin/new-issues/:id/ignore   -> admin:new-issues:write
 *
 *   POST  /admin/opensource-tools/onboarding/url                    -> admin:opensource-tools:write
 *   PATCH /admin/opensource-tools/onboarding/:id/description        -> admin:opensource-tools:write
 *   PATCH /admin/opensource-tools/onboarding/:id/labels              -> admin:opensource-tools:write
 *   PATCH /admin/opensource-tools/onboarding/:id/setup-guide         -> admin:opensource-tools:write
 *   GET   /admin/opensource-tools/onboarding/:id/preview             -> admin:opensource-tools:read
 *   POST  /admin/opensource-tools/onboarding/:id/validate            -> admin:opensource-tools:write
 *   POST  /admin/opensource-tools/onboarding/:id/complete            -> admin:opensource-tools:write
 *
 *   GET    /admin/opensource-tools        -> admin:opensource-tools:read
 *   GET    /admin/opensource-tools/:id    -> admin:opensource-tools:read
 *   PATCH  /admin/opensource-tools/:id    -> admin:opensource-tools:write
 *   DELETE /admin/opensource-tools/:id    -> admin:opensource-tools:delete
 *
 * `admin:tasks:read` / `admin:tasks:write` back admin_workflow.txt section
 * 10's Task Onboarding wizard (today: Step 1 — "Project Selection", Step 2
 * — "Select Existing Issue", Step 3 — "Issue Information", Step 4 —
 * "Fetch Project Tech Stack", and Step 5 — "Difficulty",
 * src/routes/taskOnboarding.ts) AND section 13's "All Tasks" / "View
 * Task" routes (`GET /admin/tasks`, `GET /admin/tasks/:id`,
 * `PATCH /admin/tasks/:id`, src/routes/admin/tasks.ts) — named to match
 * the existing `admin:projects:read` / `admin:projects:write` pair so
 * these plug into the same two permissions rather than each declaring a
 * new one, same reasoning as `admin:projects:*` above.
 *
 * `admin:tasks:delete` is its own, narrower permission — not folded into
 * `admin:tasks:write` — for the exact reason `admin:projects:delete` is
 * kept separate from `admin:projects:write` above: a soft-delete has a
 * different blast radius than an ordinary curation edit, and a narrower
 * admin role could plausibly get one without the other later.
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
 * github/issues`, `GET /admin/projects/:id/tech-stack`, the Task
 * Onboarding Steps 1–5 routes, and the full `/admin/tasks` module
 * (list/detail/update/delete) are implemented as of this module (Admin
 * Backend: authentication + authorization + RBAC). The rest of the
 * permission list above exists now so future admin route modules
 * (project/task/author/publish/GitHub-sync endpoints) plug into the same
 * RBAC engine instead of each inventing its own role check.
 *
 * `admin:new-issues:read` / `admin:new-issues:write` back
 * admin_workflow.txt section 16's "New Issues Section"
 * (`GET /admin/new-issues`) and its "Ignore" action
 * (`POST /admin/new-issues/:id/ignore`, src/routes/admin/newIssues.ts) —
 * kept as their own pair rather than folded into `admin:tasks:*`, even
 * though the feature is about *not-yet-a-task* GitHub issues:
 * `admin:new-issues:read` reaches out to GitHub on every call, across
 * every active project (unlike `admin:tasks:read`, which only ever reads
 * DevTunnel's own database) — the same "different blast radius gets its
 * own permission" reasoning already applied to
 * `admin:projects:github:read` above — and `admin:new-issues:write`
 * mutates a table (`devtunnel.ignored_github_issues`, sql/014) that
 * `admin:tasks:write` has no reason to touch.
 *
 * `admin:opensource-tools:read` / `admin:opensource-tools:write` back the
 * Open Source Tool Onboarding wizard (`/admin/opensource-tools/new`,
 * devtunnel-frontend/src/lib/admin/opensource-tool-onboarding/). Named
 * and scoped identically to `admin:projects:read` / `admin:projects:write`
 * — same read-vs-write split (fetching/previewing a draft vs. mutating
 * one), just for a separate resource — rather than reusing the
 * `admin:projects:*` pair itself: an open-source tool is not a project
 * (the frontend types file's own header is explicit about this
 * distinction), so a narrower admin role could plausibly manage one
 * without the other later, the same reasoning `admin:tasks:*` already
 * gets its own pair rather than folding into `admin:projects:*`.
 *
 * That same read/write pair is reused, unmodified, by
 * `/admin/opensource-tools` (src/routes/admin/opensourceTools.ts) — the
 * already-published-catalog sibling of the onboarding wizard above, same
 * relationship `/admin/tasks` has with `/admin/tasks/onboarding`.
 * `admin:opensource-tools:delete` is its own, narrower permission — not
 * folded into `:write` — for the exact reason `admin:projects:delete` is
 * kept separate from `admin:projects:write`: different blast radius, and
 * a narrower admin role could plausibly get one without the other later.
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
  "admin:tasks:delete",
  "admin:new-issues:read",
  "admin:new-issues:write",
  "admin:github:sync",
  "admin:activity:read",
  "admin:opensource-tools:read",
  "admin:opensource-tools:write",
  "admin:opensource-tools:delete",
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