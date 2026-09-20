import Link from "next/link";
import { CheckCircleIcon, PlusIcon } from "@/components/layout/nav-icons";
import type { TaskClaim } from "@/lib/tasks/progress";

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
 * What it says depends on the viewer's relationship to the task
 * (`TaskClaim`, `lib/tasks/progress.ts`), which the task-progress data now
 * makes knowable:
 *
 *  - `open` / `unknown` — "Contribute to this task".
 *  - `mine` — "Continue your task": they already started it, and the
 *    Contribute page is where `dev start` resumes and `dev submit` lives.
 *  - `other` — no action. Someone else has claimed it, and `dev start`
 *    would be rejected, so offering a button that leads to a dead end is
 *    worse than saying so.
 *  - `done` — no action; nothing left to start.
 *
 * The two non-actions state why in words beside an icon rather than
 * rendering a disabled button that gives no reason (rule 43).
 */
export function TaskContributeButton({ href, claim }: { href: string; claim: TaskClaim }) {
  if (claim === "done") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface-selected px-3.5 py-2 text-[13px] font-medium text-status-success-label">
        <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
        Task completed
      </span>
    );
  }

  if (claim === "other") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text-muted">
        Claimed by another contributor
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
    >
      <PlusIcon className="h-3.5 w-3.5 shrink-0" />
      {claim === "mine" ? "Continue your task" : "Contribute to this task"}
    </Link>
  );
}
