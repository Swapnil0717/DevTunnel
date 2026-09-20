import Link from "next/link";
import { CheckCircleIcon, PlusIcon } from "@/components/layout/nav-icons";
import type { TaskStatus } from "@/lib/tasks/types";

/**
 * View Task page's primary action — the one accent-colored button on the
 * page, same convention `ContributeButton` follows on View Project.
 *
 * Unlike the project button this is a plain link, not a button that fires
 * a request first. Joining a *project* is a recorded action
 * (`joinDevtunnelProject`) that unlocks its tasks; there's no equivalent
 * for a task — claiming one happens when the contributor runs
 * `dev start <task-id>`, which forks and claims in one step server-side.
 * So there's nothing to do on click except go to the page that explains
 * how, which makes a link the honest element: it works with middle-click,
 * opens in a new tab, and can't get stuck in a loading state.
 *
 * A finished task isn't offered the action at all. Its status is stated in
 * words beside a checkmark rather than left as a disabled button that
 * gives no reason (rule 43), and the contribute page it would have led to
 * has nothing left to start.
 */
export function TaskContributeButton({
  href,
  status,
}: {
  href: string;
  status: TaskStatus;
}) {
  if (status === "DONE") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface-selected px-3.5 py-2 text-[13px] font-medium text-status-success-label">
        <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
        Task completed
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
    >
      <PlusIcon className="h-3.5 w-3.5 shrink-0" />
      Contribute to this task
    </Link>
  );
}
