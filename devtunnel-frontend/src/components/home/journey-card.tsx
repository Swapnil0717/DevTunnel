import Link from "next/link";
import type { ReactNode } from "react";
import { getMyTasks } from "@/lib/home/api";
import { featuredTask } from "@/lib/home/task-summary";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { TASK_STAGES, stageIndex } from "@/lib/tasks/progress";
import { ArrowRightIcon } from "@/components/layout/nav-icons";
import { HomeMessage } from "./home-message";
import { HOME_PANEL } from "./styles";

const FIND_PROJECT_HREF = "/projects?intent=find";

/**
 * "Your contributor journey" — the first thing Home shows: where the viewer
 * is, in one glance, plus the one action that moves them forward. It answers
 * "what should I do next" and "what's my progress" together.
 *
 * The four steps are `TASK_STAGES` (`lib/tasks/progress.ts`) — Open, Started,
 * PR submitted, Done — the exact same stage list `TaskRow` and
 * `TaskProgressTracker` use, not a separately invented flow. This codebase's
 * rule (rule 38 — see `my-tasks-list.tsx` / `progress.ts`) is that nothing
 * here shows a state the app can't verify, and only `dev start` and
 * `dev submit` leave a record. So the tracker follows the single most
 * relevant task's real stage instead.
 *
 * Drawn as the redesign's stepper: a dot per step joined by hairlines. Steps
 * up to the current one are filled green, the connector *into* a reached step
 * is green, and the current step wears a ring. The dots and lines are
 * decorative (`aria-hidden`); each step's state is also written out for
 * assistive tech ("reached" / "not reached", `aria-current="step"` on the
 * current one), so nothing is conveyed by color alone (rule 43).
 *
 * Which task is "most relevant" is `featuredTask` (`lib/home/task-
 * summary.ts`): the active (in-progress or in-review) task most likely to
 * need the viewer's attention. A viewer with no active task but at least one
 * done one sees every step reached with a congratulatory line; a viewer with
 * no tasks at all sees no step reached and a prompt to find a project — a
 * brand-new contributor lands on "Find a project", not onboarding (already
 * handled upstream by `(protected)/layout.tsx`) or a hidden card.
 */
export async function JourneyCard() {
  const result = await getMyTasks();

  if (result.status === "error") {
    return (
      <HomeMessage className="mb-3">
        Your progress isn&apos;t available yet — check back soon.
      </HomeMessage>
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
      className={`mb-3 ${HOME_PANEL}`}
    >
      <div className="px-5 pb-[22px] pt-[18px]">
        <h2
          id="journey-heading"
          className="m-0 mb-[18px] text-[12.5px] font-normal text-text-muted"
        >
          Your contributor journey
        </h2>

        <ol className="m-0 grid list-none grid-cols-4 p-0">
          {TASK_STAGES.map((stage, index) => {
            const reached = index <= reachedIndex;
            const current = index === reachedIndex;
            const connectorReached = index + 1 <= reachedIndex;
            const last = index === TASK_STAGES.length - 1;

            return (
              <li
                key={stage.status}
                aria-current={current ? "step" : undefined}
                className="relative"
              >
                <span
                  aria-hidden="true"
                  className={`mb-3 block h-[9px] w-[9px] rounded-full ${
                    reached ? "bg-accent" : "border border-[#3A3A3A] bg-[#0E0E0E]"
                  } ${current ? "outline outline-1 outline-offset-[3px] outline-accent" : ""}`}
                />
                {!last ? (
                  <span
                    aria-hidden="true"
                    className={`absolute left-[15px] right-[9px] top-1 h-px ${
                      connectorReached ? "bg-accent" : "bg-border"
                    }`}
                  />
                ) : null}
                <span className={`block pr-2 text-[12.5px] ${reached ? "text-text" : "text-text-dim"}`}>
                  {stage.label === "Started" ? "Started a task" : stage.label}
                </span>
                <span className="sr-only">{reached ? " (reached)" : " (not reached)"}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#1F1F1F] px-5 py-3.5">
        <p className="m-0 max-w-[430px] break-words text-[13px] leading-[1.6] text-[#A8A8A8]">
          {message}
        </p>
        <Link
          href={cta.href}
          className="inline-flex flex-none items-center gap-1.5 whitespace-nowrap rounded-[7px] bg-text px-[13px] py-2 text-[12.5px] font-medium text-bg transition-colors hover:bg-white"
        >
          {cta.label}
          <ArrowRightIcon className="h-3.5 w-3.5" />
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
            . Run{" "}
            <code className="whitespace-nowrap rounded-[4px] border border-border bg-[#161616] px-1.5 py-px font-mono text-[12px] text-text-secondary">
              dev submit
            </code>{" "}
            when it&apos;s ready.
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
