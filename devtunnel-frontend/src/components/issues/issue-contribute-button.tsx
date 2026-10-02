import Link from "next/link";
import { PlusIcon } from "@/components/layout/nav-icons";
import { issueContributeHref } from "@/lib/issues/hrefs";
import type { IssueDetail } from "@/lib/issues/detail-types";

/**
 * View Issue page's primary action — the one accent-colored button on the
 * page, same convention `TaskContributeButton` follows on View Task.
 *
 * A plain link, not a button that fires a request: an issue isn't something
 * you claim in DevTunnel, so there is nothing to record on click — only a
 * page to go to. A link also works with middle-click and can't get stuck in
 * a loading state.
 *
 * What it says depends on the issue:
 *
 *  - open, no task — "Contribute to this issue", to the issue's own
 *    Contribute page.
 *  - a DevTunnel task exists — "View the DevTunnel task". That task is where
 *    claiming and `dev start` happen, so sending someone to the issue's
 *    generic steps instead would be the wrong door.
 *  - closed — no action; the reason is stated beside an icon rather than
 *    rendering a disabled button that gives none (rule 43).
 */
export function IssueContributeButton({ issue }: { issue: IssueDetail }) {
  if (issue.state === "CLOSED") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text-muted">
        Closed on GitHub
      </span>
    );
  }

  const href = issue.task
    ? `/projects/${issue.project.slug}/tasks/${issue.task.id}`
    : issueContributeHref(issue.project.slug, issue.number);

  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
    >
      <PlusIcon className="h-3.5 w-3.5 shrink-0" />
      {issue.task ? "View the DevTunnel task" : "Contribute to this issue"}
    </Link>
  );
}
