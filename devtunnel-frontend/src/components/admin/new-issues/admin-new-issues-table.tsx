import Link from "next/link";
import { IssueIcon } from "@/components/layout/nav-icons";
import { IgnoreNewIssueButton } from "./ignore-new-issue-button";
import type { AdminNewIssue } from "@/lib/admin/new-issues/types";

/** How many labels to show inline before collapsing into "+N". */
const MAX_VISIBLE_LABELS = 3;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * New Issues table — admin_workflow.txt section 16 ("New Issues Section
 * ▸ Frontend"):
 *
 * Issue #, Issue Title, Project, GitHub Author, Labels, Created, Updated,
 * Actions.
 *
 * Dates are shown as readable text plus a machine-readable `<time
 * datetime>` (Frontend_Development_Rules.txt rule 46), and the state
 * badge is always paired with the word "Open"/"Closed" — never color
 * alone (rule 43).
 *
 * Actions (section 16: "View, Create Task, Ignore — only include actions
 * supported by the actual workflow"):
 * - View: opens the GitHub issue itself in a new tab. There is no
 *   DevTunnel detail page for an issue that isn't a task yet, so "View"
 *   means viewing the actual GitHub source of truth (section 1: "GitHub
 *   remains the source of truth for the repository") — not a fabricated
 *   DevTunnel page for data that doesn't exist as a DevTunnel record.
 * - Create Task: starts Task Onboarding (`/admin/tasks/new`), matching
 *   section 17's flow exactly ("New Issues → Admin selects → Create
 *   Task → Task Onboarding"). The wizard's own Step 1/2 handle picking
 *   the project and this exact issue; this link only starts that flow
 *   rather than assuming a pre-fill endpoint this frontend doesn't have.
 * - Ignore: `IgnoreNewIssueButton` — removes the issue from this list
 *   without touching GitHub (see that component and
 *   `lib/admin/new-issues/client-api.ts`).
 */
export function AdminNewIssuesTable({ issues }: { issues: AdminNewIssue[] }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border">
      <table className="w-full min-w-[1080px] border-collapse text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-surface">
            {[
              "Issue",
              "Project",
              "GitHub author",
              "Labels",
              "Created",
              "Updated",
              "Actions",
            ].map((heading) => (
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
          {issues.map((issue) => {
            const visibleLabels = issue.labels.slice(0, MAX_VISIBLE_LABELS);
            const hiddenLabelCount = issue.labels.length - visibleLabels.length;

            return (
              <tr
                key={issue.id}
                className="border-b border-border-subtle last:border-b-0 hover:bg-surface/60"
              >
                {/* Issue # + title + open/closed state */}
                <th scope="row" className="px-4 py-3 align-top font-medium text-text">
                  <a
                    href={issue.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-start gap-1.5 hover:text-accent"
                  >
                    <IssueIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="block">{issue.title}</span>
                      <span className="mt-0.5 block font-mono text-[11px] text-text-faint">
                        #{issue.number} ·{" "}
                        {issue.state === "OPEN" ? "Open" : "Closed"}
                      </span>
                    </span>
                  </a>
                </th>

                {/* Project (+ repository) */}
                <td className="px-4 py-3 align-top">
                  <p className="m-0 text-text-secondary">{issue.project.name}</p>
                  <p className="m-0 mt-0.5 font-mono text-[11px] text-text-faint">
                    {issue.project.repositoryFullName}
                  </p>
                </td>

                {/* GitHub author */}
                <td className="px-4 py-3 align-top text-text-secondary">
                  <a
                    href={issue.author.profileUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hover:text-accent"
                  >
                    @{issue.author.username}
                  </a>
                </td>

                {/* Labels */}
                <td className="px-4 py-3 align-top">
                  {issue.labels.length === 0 ? (
                    <span className="text-text-faint">—</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      {visibleLabels.map((label) => (
                        <span
                          key={label}
                          className="inline-flex items-center rounded-md border border-border bg-surface px-1.5 py-0.5 text-[11px] text-text-secondary"
                        >
                          {label}
                        </span>
                      ))}
                      {hiddenLabelCount > 0 ? (
                        <span className="text-[11px] text-text-faint">+{hiddenLabelCount}</span>
                      ) : null}
                    </div>
                  )}
                </td>

                {/* Created */}
                <td className="whitespace-nowrap px-4 py-3 align-top text-text-secondary">
                  <time dateTime={issue.createdAt}>{formatDate(issue.createdAt)}</time>
                </td>

                {/* Updated */}
                <td className="whitespace-nowrap px-4 py-3 align-top text-text-secondary">
                  <time dateTime={issue.updatedAt}>{formatDate(issue.updatedAt)}</time>
                </td>

                {/* Actions */}
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap items-center gap-1">
                    {/* View — the GitHub issue itself, not a DevTunnel page */}
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-md px-2 py-1 text-[11.5px] font-medium text-text-secondary hover:text-accent"
                    >
                      View
                    </a>

                    {/* Create Task — starts Task Onboarding (section 17) */}
                    <Link
                      href="/admin/tasks/new"
                      className="rounded-md px-2 py-1 text-[11.5px] font-medium text-text-secondary hover:text-accent"
                    >
                      Create task
                    </Link>

                    {/* Ignore */}
                    <IgnoreNewIssueButton
                      issueId={issue.id}
                      issueTitle={issue.title}
                      issueNumber={issue.number}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
