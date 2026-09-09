import { IssueIcon } from "@/components/layout/nav-icons";
import type { AdminTaskSummary } from "@/lib/admin/tasks/types";

/**
 * "Deleted DevTunnel Tasks / Issues" (admin_workflow.txt section 15):
 * tasks removed from DevTunnel while their GitHub issue still exists.
 * Deliberately its own table with the spec's own column list — "Issue #,
 * Issue Title, Project, Deleted At, Deletion Status" — not
 * `AdminTasksTable`'s columns, since role/difficulty/contributors/
 * submissions describe an active DevTunnel task, not a deleted one.
 *
 * "The GitHub issue is not deleted just because the DevTunnel
 * representation is deleted" — so the issue link here always points at
 * GitHub, exactly like `AdminTasksTable`'s GitHub Issue column.
 */
export function AdminDeletedTasksTable({ tasks }: { tasks: AdminTaskSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border">
      <table className="w-full min-w-[640px] border-collapse text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-surface">
            {["Issue #", "Issue title", "Project", "Deleted at", "Deletion status"].map(
              (heading) => (
                <th
                  key={heading}
                  scope="col"
                  className="px-4 py-3 text-[11px] font-normal uppercase tracking-wide text-text-faint"
                >
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>

        <tbody>
          {tasks.map((task) => (
            <tr
              key={task.id}
              className="border-b border-border-subtle last:border-b-0 hover:bg-surface/60"
            >
              {/* Issue # */}
              <td className="px-4 py-3">
                {task.githubIssue ? (
                  <a
                    href={task.githubIssue.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-text-secondary hover:text-accent"
                  >
                    <IssueIcon className="h-3.5 w-3.5 shrink-0" />#{task.githubIssue.number}
                  </a>
                ) : (
                  <span className="text-text-faint">—</span>
                )}
              </td>

              {/* Issue title */}
              <th scope="row" className="px-4 py-3 font-medium text-text">
                {task.githubIssue?.title ?? task.title}
              </th>

              {/* Project */}
              <td className="px-4 py-3 text-text-secondary">{task.project.name}</td>

              {/* Deleted at */}
              <td className="px-4 py-3 text-text-secondary">
                {task.deletedAt ? (
                  <time dateTime={task.deletedAt}>{formatDate(task.deletedAt)}</time>
                ) : (
                  "—"
                )}
              </td>

              {/* Deletion status */}
              <td className="px-4 py-3 text-text-secondary">
                Removed from DevTunnel — GitHub issue still exists
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}