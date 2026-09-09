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
 * Table for `/admin/tasks/new-issues/since-onboarding`.
 *
 * Same row shape and actions as `AdminNewIssuesTable` (section 16 ▸
 * Frontend: Issue #, Issue Title, Project, GitHub Author, Labels,
 * Created, Updated, plus View / Create Task / Ignore) — this page isn't
 * a different resource, just a filtered lens on the same one (see
 * `lib/admin/new-issues/since-onboarding.ts`). The one addition is an
 * "Added to DevTunnel" column showing each issue's project's own
 * onboarding date, so an Admin can see *why* an issue qualifies for this
 * view (its Created date falls on or after that column) without having
 * to cross-reference the Projects page.
 *
 * Kept as its own component rather than an optional prop on
 * `AdminNewIssuesTable` — the extra column only ever makes sense next to
 * this specific filter, and threading a conditional column through the
 * shared table would couple two independently-evolving pages together.
 */
export function AdminIssuesSinceOnboardingTable({ issues }: { issues: AdminNewIssue[] }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border">
      <table className="w-full min-w-[1200px] border-collapse text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-surface">
            {[
              "Issue",
              "Project",
              "GitHub author",
              "Labels",
              "Added to DevTunnel",
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

                {/* Added to DevTunnel — the project's own onboarding date */}
                <td className="whitespace-nowrap px-4 py-3 align-top text-text-secondary">
                  <time dateTime={issue.project.onboardedAt}>
                    {formatDate(issue.project.onboardedAt)}
                  </time>
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
