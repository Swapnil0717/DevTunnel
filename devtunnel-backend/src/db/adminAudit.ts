import type { SupabaseClient } from "@supabase/supabase-js";

/** Mirrors `devtunnel.admin_audit_result` (sql/005_add_admin_audit_log.sql). */
export type AdminAuditResult = "SUCCESS" | "DENIED" | "FAILURE";

/**
 * Full row shape as stored in `devtunnel.admin_audit_log`. Every field
 * here is safe to return to an authenticated admin via `GET
 * /admin/activity` — `admin_id` identifies which admin account acted (or
 * attempted to), never a secret. `metadata` must never contain a secret,
 * raw token, or full request body — callers of `recordAdminAudit` are
 * responsible for passing only already-safe values, same discipline as
 * src/lib/logger.ts's `redact()` (Backend_Development_Rules.txt rule 59).
 */
export interface AdminAuditEntry {
  id: string;
  adminId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  result: AdminAuditResult;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminAuditEntryInput {
  adminId: string;
  /** Short machine-readable action name, e.g. "ADMIN_ACCESS_DENIED". */
  action: string;
  /** What kind of thing `resourceId` identifies, e.g. "route", "permission". */
  resourceType: string;
  resourceId: string | null;
  result: AdminAuditResult;
  metadata?: Record<string, unknown>;
}

/**
 * Appends one row to `devtunnel.admin_audit_log`. Append-only by
 * convention — nothing in this codebase updates or deletes these rows.
 *
 * Callers (src/middleware/adminAuth.ts today; future admin route handlers
 * for state-changing actions) treat a failure here as best-effort: an
 * audit-log write failing must never block or fail the request it's
 * attached to (same pattern as the session `last_used_at` touch in
 * src/db/sessions.ts) — but it IS thrown here so the caller can decide
 * that and log it loudly (rule 21: never silently swallow an error).
 */
export async function recordAdminAudit(
  supabase: SupabaseClient,
  entry: AdminAuditEntryInput,
): Promise<void> {
  const { error } = await supabase.from("admin_audit_log").insert({
    admin_id: entry.adminId,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId,
    result: entry.result,
    metadata: entry.metadata ?? {},
  });

  if (error) throw new Error(`Failed to record admin audit entry: ${error.message}`);
}

export interface ListAdminAuditOptions {
  /** Max rows to return (already validated by the route's Zod schema). */
  limit: number;
  /** Keyset cursor — return rows strictly older than this `created_at`. */
  before: string | null;
}

export interface AdminAuditPage {
  entries: AdminAuditEntry[];
  /** Pass as `before` on the next request to fetch the following page. `null` when there are no more rows. */
  nextCursor: string | null;
}

/**
 * Keyset-paginated (not offset-based) read of `devtunnel.admin_audit_log`,
 * newest first. Keyset pagination is used because this table only ever
 * grows and is read in "load more" order — an offset-based `LIMIT/OFFSET`
 * would get slower and can skip/duplicate rows as new entries are
 * inserted between page loads (Backend_Development_Rules.txt: pagination
 * for large collections must actually scale).
 */
export async function listAdminAuditLog(
  supabase: SupabaseClient,
  options: ListAdminAuditOptions,
): Promise<AdminAuditPage> {
  let query = supabase
    .from("admin_audit_log")
    .select("id, admin_id, action, resource_type, resource_id, result, metadata, created_at")
    .order("created_at", { ascending: false })
    // Fetch one extra row so we can tell whether another page exists
    // without a separate COUNT query.
    .limit(options.limit + 1);

  if (options.before) {
    query = query.lt("created_at", options.before);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load admin audit log: ${error.message}`);

  type Row = {
    id: string;
    admin_id: string;
    action: string;
    resource_type: string;
    resource_id: string | null;
    result: AdminAuditResult;
    metadata: Record<string, unknown> | null;
    created_at: string;
  };

  const rows = (data ?? []) as Row[];
  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;

  return {
    entries: page.map((row) => ({
      id: row.id,
      adminId: row.admin_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      result: row.result,
      metadata: row.metadata ?? {},
      createdAt: row.created_at,
    })),
    nextCursor: hasMore ? (page[page.length - 1] as Row).created_at : null,
  };
}