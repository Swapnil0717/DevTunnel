import Link from "next/link";
import { AdminTaskStatusBadge } from "@/components/admin/tasks/admin-task-status-badge";
import { TechIcon } from "@/components/onboarding/tech-icon";
import { StatusDot } from "@/components/ui/status-dot";
import type { IssueDetail, IssueDetailTaskRef } from "@/lib/issues/detail-types";

/**
 * The pieces of the View Issue page (`/issues/:projectSlug/:issueNumber`)
 * that are specific to an *issue*, split out of the route file the way
 * `task-detail-sections.tsx` splits the View Task page.
 *
 * The two sections an issue page shares with a task page are not rebuilt:
 * the page renders `TaskProjectSection` ("About the project") and
 * `TaskIssueSection` ("Issue description") straight from
 * `components/tasks/task-detail-sections`. `IssueDetail` already carries
 * every field those take (`IssueProjectRef` is the same shape as
 * `TaskProjectRef`, and the issue's number/title/url/state/author are exactly
 * `TaskGithubIssueRef`), so a second copy would only drift
 * (Frontend_Development_Rules.txt rule 51).
 *
 * Server components only — no state, no effects.
 */

const SECTION_CLASS = "rounded-[10px] border border-border bg-surface p-5";
const HEADING_CLASS = "m-0 text-[11px] uppercase tracking-wide text-text-faint";

/** Readable text plus a machine-readable `<time>` at the call sites (rule 46). */
export function formatIssueDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Open/Closed as a dot plus the word — never color alone (rule 43). */
export function IssueStateWord({ state }: { state: IssueDetail["state"] }) {
  const isOpen = state === "OPEN";
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusDot color={isOpen ? "#639922" : "#6B6B6B"} />
      {isOpen ? "Open" : "Closed"}
    </span>
  );
}

/** The issue's GitHub labels as chips — same chip style as the All Issues cards. Renders nothing for an unlabelled issue. */
export function IssueLabels({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <ul className="m-0 mt-3 flex list-none flex-wrap items-center gap-1.5 p-0" aria-label="Labels">
      {labels.map((label) => (
        <li
          key={label}
          className="inline-flex items-center rounded-md border border-border bg-surface-raised px-2 py-0.5 text-[11.5px] text-text-secondary"
        >
          {label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Shown when DevTunnel already turned this issue into a task. A task is
 * where claiming, `dev start` and progress live, so the page says so and
 * points there instead of offering a second, parallel way in.
 */
export function IssueTaskNotice({ task, projectSlug }: { task: IssueDetailTaskRef; projectSlug: string }) {
  return (
    <section aria-labelledby="issue-task-heading" className="rounded-[10px] border border-accent/25 bg-accent/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="issue-task-heading" className="m-0 text-[13px] font-medium text-text">
            DevTunnel already has a task for this issue
          </h2>
          <p className="m-0 mt-1 text-[12.5px] leading-relaxed text-text-secondary">
            <span className="text-text">{task.title}</span> — claiming it and submitting your pull request happen on the
            task, so start there.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <AdminTaskStatusBadge status={task.status} />
          <Link
            href={`/projects/${projectSlug}/tasks/${task.id}`}
            className="text-[12.5px] font-medium text-text hover:text-accent"
          >
            View task
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * The right-hand rail: the issue's facts and the project's tech stack. Same
 * rail-of-cards shape `TaskDetailSidebar` uses, stacking under the main
 * column on narrow screens.
 *
 * An issue has no tech stack of its own — like a task, it shows its
 * project's curated one, which is what you'd be working in.
 *
 * There's deliberately no accent-colored action in the rail — the page's one
 * primary action is the Contribute button in the header.
 */
export function IssueDetailSidebar({ issue }: { issue: IssueDetail }) {
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
      <section aria-labelledby="issue-details-heading" className={SECTION_CLASS}>
        <h2 id="issue-details-heading" className={`${HEADING_CLASS} mb-3`}>
          Details
        </h2>
        <dl className="m-0 grid grid-cols-[92px_1fr] gap-x-4 gap-y-3 text-[12.5px]">
          <dt className="text-text-faint">State</dt>
          <dd className="m-0 text-text-secondary">
            <IssueStateWord state={issue.state} />
          </dd>

          <dt className="text-text-faint">Opened by</dt>
          <dd className="m-0 min-w-0 truncate text-text-secondary">
            <a href={issue.author.profileUrl} target="_blank" rel="noreferrer noopener" className="hover:text-accent">
              @{issue.author.username}
            </a>
          </dd>

          <dt className="text-text-faint">Created</dt>
          <dd className="m-0 text-text-secondary">
            <time suppressHydrationWarning dateTime={issue.createdAt}>
              {formatIssueDate(issue.createdAt)}
            </time>
          </dd>

          <dt className="text-text-faint">Updated</dt>
          <dd className="m-0 text-text-secondary">
            <time suppressHydrationWarning dateTime={issue.updatedAt}>
              {formatIssueDate(issue.updatedAt)}
            </time>
          </dd>

          <dt className="text-text-faint">Comments</dt>
          <dd className="m-0 text-text-secondary">{issue.commentCount.toLocaleString()}</dd>
        </dl>
      </section>

      <section aria-labelledby="issue-techstack-heading" className={SECTION_CLASS}>
        <h2 id="issue-techstack-heading" className={`${HEADING_CLASS} mb-3`}>
          Tech stack
        </h2>
        {issue.project.techStack.length === 0 ? (
          <p className="m-0 text-[12px] text-text-faint">No tech stack recorded.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {issue.project.techStack.map((value) => (
              <span
                key={value}
                className="inline-flex items-center gap-1.5 rounded-md border border-tag-tech-border bg-tag-tech-bg px-2 py-0.5 text-[11.5px] text-tag-tech-text"
              >
                <TechIcon name={value} />
                {value}
              </span>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}
