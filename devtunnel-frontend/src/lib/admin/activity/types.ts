/**
 * Local, frontend-only shapes for the Admin **Activity** page
 * (`/admin/activity` — devtunnel-backend `GET /admin/activity`,
 * `src/routes/admin/activity.ts`).
 *
 * Mirrors `AdminAuditEntry` / `AdminAuditResult`
 * (devtunnel-backend/src/db/adminAudit.ts) field for field — every row
 * in `devtunnel.admin_audit_log` (sql/005_add_admin_audit_log.sql) is
 * either a denied admin/permission check written by
 * `requireAdminRole`/`requirePermission` (`src/middleware/adminAuth.ts`),
 * or an admin action's own audit write (project/task/tool
 * update/delete/sync, AI discovery run, budget change, new-issue
 * ignore, ...) — see each route's own `recordAdminAudit` call. Nothing
 * here is invented; `metadata` is already redacted by whichever caller
 * wrote the row (Backend_Development_Rules.txt rule 59), never a secret
 * or raw request body.
 */

/** Mirrors `devtunnel.admin_audit_result` (sql/005). */
export type AdminAuditResult = "SUCCESS" | "DENIED" | "FAILURE";

/** A single row of `devtunnel.admin_audit_log`, exactly as `GET /admin/activity` returns it. */
export interface AdminAuditEntry {
  id: string;
  adminId: string;
  /** Short machine-readable action name, e.g. "ADMIN_PROJECT_UPDATED", "ADMIN_ACCESS_DENIED". */
  action: string;
  /** What kind of thing `resourceId` identifies, e.g. "project", "task", "route". */
  resourceType: string;
  resourceId: string | null;
  result: AdminAuditResult;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/**
 * `GET /admin/activity` response body — wrapped in the standard
 * `{ data: ... }` envelope (unlike `GET /admin/projects` /
 * `/admin/tasks` / `/admin/opensource-tools` / `/admin/new-issues`,
 * which are documented exceptions returning a raw array — see each of
 * those routes' own doc comments). `nextCursor` is the keyset cursor
 * (the oldest entry's `createdAt` on this page) to pass as `before` on
 * the next request; `null` once there are no more rows.
 */
export interface AdminActivityPage {
  entries: AdminAuditEntry[];
  nextCursor: string | null;
}