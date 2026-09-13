import { AdminAuditResultBadge } from "./admin-audit-result-badge";
import type { AdminAuditEntry } from "@/lib/admin/activity/types";

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Turns an `ADMIN_PROJECT_UPDATED`-style action code into "Admin project
 * updated" for display — the raw code is still shown underneath in
 * monospace for anyone who wants the exact machine-readable value, same
 * "readable text + exact value" pairing `AdminNewIssuesTable` uses for
 * issue numbers.
 */
function humanizeAction(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Activity table — `GET /admin/activity`
 * (devtunnel-backend/src/routes/admin/activity.ts). Read-only over
 * `devtunnel.admin_audit_log`: every denied admin/permission check
 * (`requireAdminRole`/`requirePermission`) and every state-changing
 * admin action's own audit write (project/task/tool update, delete,
 * sync, AI discovery run, budget change, new-issue ignore, ...) shows up
 * here exactly as recorded — nothing is summarized or reinterpreted.
 *
 * `resourceId` is shown only when present — `recordAdminAudit` calls
 * that describe an account-wide action (a sync-all run, a budget
 * change) pass `resourceId: null` rather than a fabricated id.
 * `metadata` is rendered as compact JSON when non-empty, since its
 * shape varies per action (see each route's own `recordAdminAudit`
 * call) and every value already passed through that caller's own
 * redaction before being written (Backend_Development_Rules.txt rule
 * 59) — nothing sensitive to hide here that the backend didn't already
 * keep out.
 */
export function AdminActivityTable({ entries }: { entries: AdminAuditEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border">
      <table className="w-full min-w-[900px] border-collapse text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-surface">
            {["Time", "Action", "Resource", "Admin", "Result", "Details"].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="px-4 py-3 text-[11px] font-normal uppercase tracking-wide text-text-faint"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {entries.map((entry) => {
            const metadataEntries = Object.entries(entry.metadata);

            return (
              <tr
                key={entry.id}
                className="border-b border-border-subtle last:border-b-0 hover:bg-surface/60"
              >
                {/* Time */}
                <td className="whitespace-nowrap px-4 py-3 align-top text-text-secondary">
                  <time dateTime={entry.createdAt}>{formatTimestamp(entry.createdAt)}</time>
                </td>

                {/* Action */}
                <th scope="row" className="px-4 py-3 align-top font-medium text-text">
                  <span className="block">{humanizeAction(entry.action)}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-text-faint">
                    {entry.action}
                  </span>
                </th>

                {/* Resource */}
                <td className="px-4 py-3 align-top text-text-secondary">
                  <span className="block">{entry.resourceType}</span>
                  {entry.resourceId ? (
                    <span className="mt-0.5 block font-mono text-[11px] text-text-faint">
                      {entry.resourceId}
                    </span>
                  ) : null}
                </td>

                {/* Admin */}
                <td className="px-4 py-3 align-top font-mono text-[11px] text-text-secondary">
                  {entry.adminId}
                </td>

                {/* Result */}
                <td className="px-4 py-3 align-top">
                  <AdminAuditResultBadge result={entry.result} />
                </td>

                {/* Details (metadata) */}
                <td className="max-w-[280px] px-4 py-3 align-top">
                  {metadataEntries.length === 0 ? (
                    <span className="text-text-faint">—</span>
                  ) : (
                    <dl className="m-0 flex flex-col gap-0.5">
                      {metadataEntries.map(([key, value]) => (
                        <div key={key} className="flex gap-1.5 truncate">
                          <dt className="shrink-0 text-text-faint">{key}:</dt>
                          <dd className="m-0 truncate text-text-secondary">
                            {typeof value === "string" ? value : JSON.stringify(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}