import Link from "next/link";
import type { ReactNode } from "react";
import { getMyTasks } from "@/lib/home/api";
import { featuredTask } from "@/lib/home/task-summary";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { TASK_STAGES, stageIndex } from "@/lib/tasks/progress";
import { SectionMessage } from "./section-message";

const FIND_PROJECT_HREF = "/projects?intent=find";

/**
 * "Your contributor journey" — the first thing Home shows: one sentence
 * saying exactly what state the viewer is in, plus the one action that
 * moves them forward. It answers "what should I do next" and "what's my
 * progress" in the same glance, the way a typical product home/dashboard
 * screen leads with an onboarding or progress module before any content
 * lists.
 *
 * The four segments are `TASK_STAGES` (`lib/tasks/progress.ts`) — Open,
 * Started, PR submitted, Done — the exact same stage list `TaskRow` and
 * `TaskProgressTracker` use, not a separately invented flow like "signed
 * up → picked a project → started a task → submitted a PR". Those middle
 * two steps have no backend event behind them (there's no "project
 * picked" record — only `dev start` and `dev submit` are), and this
 * codebase's own rule (rule 38 — see `my-tasks-list.tsx` / `progress.ts`)
 * is that nothing here shows a state the app can't verify. So the bar
 * tracks the single most relevant task's real stage instead.
 *
 * Which task is "most relevant" is `featuredTask` (`lib/home/task-
 * summary.ts`): the active (in-progress or in-review) task most likely to
 * need the viewer's attention. A viewer with no active task but at least
 * one done one sees the bar fully lit with a congratulatory line; a
 * viewer with no tasks at all sees an unlit bar and a prompt to find a
 * project — matching this session's decision that a brand-new contributor
 * lands on "Find a project", not onboarding (already handled upstream by
 * `(protected)/layout.tsx`) or a hidden card.
 */
export async function JourneyCard() {
  const result = await getMyTasks();

  if (result.status === "error") {
    return (
      <SectionMessage>
        Your progress isn&apos;t available yet — check back soon.
      </SectionMessage>
    );
  }

  const tasks = result.status === "ok" ? result.data : [];
  const featured = featuredTask(tasks);
  const done = tasks.filter((task) => task.status === "DONE");

  const reachedIndex = featured
    ? stageIndex(featured.status)
    : done.length > 0
      ? stageIndex("DONE")
      : -1;

  const { message, cta } = describeState({ featured, doneCount: done.length });

  return (
    <section
      aria-labelledby="journey-heading"
      className="mb-5 rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <h2 id="journey-heading" className="m-0 mb-3 text-[12px] text-text-muted">
        Your contributor journey
      </h2>

      <ol className="m-0 mb-3.5 grid grid-cols-4 gap-2 list-none p-0">
        {TASK_STAGES.map((stage, index) => {
          const reached = index <= reachedIndex;
          return (
            <li key={stage.status}>
              <span
                aria-hidden="true"
                className="mb-1.5 block h-1 rounded-full"
                style={{ backgroundColor: reached ? stage.color : undefined }}
              >
                {!reached ? <span className="block h-full rounded-full bg-border-strong" /> : null}
              </span>
              <span className={`text-[11px] ${reached ? "text-text" : "text-text-faint"}`}>
                {stage.label === "Started" ? "Started a task" : stage.label}
              </span>
              <span className="sr-only">{reached ? " (reached)" : " (not reached)"}</span>
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-[13px] text-text-secondary">{message}</p>
        <Link
          href={cta.href}
          className="inline-flex shrink-0 items-center gap-1 rounded-[8px] border border-border-strong bg-surface px-3 py-1.5 text-[12.5px] font-medium text-text transition-colors hover:bg-surface-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {cta.label}
        </Link>
      </div>
    </section>
  );
}

function describeState({
  featured,
  doneCount,
}: {
  featured: ReturnType<typeof featuredTask>;
  doneCount: number;
}): { message: ReactNode; cta: { href: string; label: string } } {
  if (featured) {
    if (featured.status === "IN_PROGRESS") {
      return {
        message: (
          <>
            You started{" "}
            <span className="font-medium text-text">{featured.title}</span>
            {featured.startedAt ? (
              <>
                {" "}
                <time dateTime={featured.startedAt}>
                  {formatRelativeTime(featured.startedAt)}
                </time>
              </>
            ) : null}
            . Run <code className="font-mono text-[12px]">dev submit</code> when it&apos;s ready.
          </>
        ),
        cta: { href: `/projects/${featured.projectSlug}/tasks/${featured.taskId}`, label: "Continue task" },
      };
    }

    return {
      message: (
        <>
          Your pull request for{" "}
          <span className="font-medium text-text">{featured.title}</span> is open and waiting on
          review.
        </>
      ),
      cta: { href: `/projects/${featured.projectSlug}/tasks/${featured.taskId}`, label: "View task" },
    };
  }

  if (doneCount > 0) {
    return {
      message: (
        <>
          You&apos;ve completed {doneCount} {doneCount === 1 ? "task" : "tasks"}. Nice work — pick
          up another?
        </>
      ),
      cta: { href: FIND_PROJECT_HREF, label: "Find a project" },
    };
  }

  return {
    message: "You haven't picked a project yet. Browse ones matched to your skills to get started.",
    cta: { href: FIND_PROJECT_HREF, label: "Find a project" },
  };
}
