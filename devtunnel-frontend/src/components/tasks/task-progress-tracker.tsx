import type { ReactNode } from "react";
import { CheckCircleIcon } from "@/components/layout/nav-icons";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { TASK_STAGES, getTaskClaim, stageIndex } from "@/lib/tasks/progress";
import type { TaskDetail } from "@/lib/tasks/types";

type StageState = "complete" | "current" | "upcoming";

/**
 * The four-stage progress tracker on the View Task page and the task
 * Contribute page: **Open → Started → PR submitted → Done**, with one
 * plain sentence underneath saying what that means for *this viewer*
 * ("You started this 2 days ago", "Another contributor is working on
 * this task").
 *
 * Built only from facts the backend records — the task's `status`, and
 * the `progress` block (`viewerIsAssignee`, `startedAt`, `pullRequest`)
 * that `GET /projects/:projectSlug/tasks/:taskId` returns. It never reads
 * the Contribute page's private checklist: that one is a scratchpad whose
 * ticks nobody verified (backend sql/027), so treating it as progress
 * would show a state the app can't stand behind (rule 38). "PR submitted"
 * likewise means a pull request was *opened*, not merged — DevTunnel
 * doesn't observe the merge — so nothing here says "merged" before the
 * task itself is `DONE`.
 *
 * It also settles a question the Contribute page previously had to hedge
 * on: whether an in-progress task is the viewer's own. `viewerIsAssignee`
 * answers that without revealing who else has claimed what.
 *
 * Accessibility: state is conveyed in words for screen readers (visually
 * hidden "completed" / "current stage"), never by the bar color alone
 * (rule 43), and the current step carries `aria-current="step"`. A
 * server component — no state, no effects.
 */
export function TaskProgressTracker({ task }: { task: TaskDetail }) {
  const currentIndex = stageIndex(task.status);
  const isDone = task.status === "DONE";
  const progress = task.progress;

  function stateOf(index: number): StageState {
    if (isDone || index < currentIndex) return "complete";
    return index === currentIndex ? "current" : "upcoming";
  }

  /** Real data for a reached stage where there is some; otherwise the stage's own one-line meaning. */
  function detailFor(index: number): ReactNode {
    const stage = TASK_STAGES[index];
    if (!stage) return null;
    const reached = index <= currentIndex;

    if (index === 1 && reached && progress?.startedAt) {
      return (
        <>
          Started <time dateTime={progress.startedAt}>{formatRelativeTime(progress.startedAt)}</time>
        </>
      );
    }

    if (index === 2 && reached && progress?.pullRequest) {
      const pr = progress.pullRequest;
      const label = pr.number !== null ? `PR #${pr.number}` : "Pull request";
      return pr.url ? (
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-text-secondary underline-offset-2 hover:text-accent hover:underline"
        >
          {label}
        </a>
      ) : (
        label
      );
    }

    return stage.description;
  }

  return (
    <section
      aria-labelledby="task-progress-heading"
      className="rounded-[10px] border border-border bg-surface p-5"
    >
      <h2
        id="task-progress-heading"
        className="m-0 mb-4 text-[11px] uppercase tracking-wide text-text-faint"
      >
        Progress
      </h2>

      <ol className="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-4 p-0 sm:grid-cols-4">
        {TASK_STAGES.map((stage, index) => {
          const state = stateOf(index);

          return (
            <li key={stage.status} aria-current={state === "current" ? "step" : undefined}>
              <span
                aria-hidden="true"
                className="block h-1 overflow-hidden rounded-full bg-border-subtle"
              >
                {state !== "upcoming" ? (
                  <span
                    className={`block h-full rounded-full bg-accent ${
                      state === "current" ? "w-1/2" : "w-full"
                    }`}
                  />
                ) : null}
              </span>

              <p
                className={`m-0 mt-2 flex items-center gap-1.5 text-[12.5px] font-medium ${
                  state === "upcoming" ? "text-text-faint" : "text-text"
                }`}
              >
                {state === "complete" ? (
                  <CheckCircleIcon className="h-3.5 w-3.5 shrink-0 text-status-success-label" />
                ) : (
                  <span aria-hidden="true" className="font-mono text-[11px] text-text-faint">
                    {index + 1}
                  </span>
                )}
                {stage.label}
                <span className="sr-only">
                  {state === "complete" ? " (completed)" : state === "current" ? " (current stage)" : " (not reached)"}
                </span>
              </p>

              <p className="m-0 mt-0.5 text-[11.5px] leading-snug text-text-faint">
                {detailFor(index)}
              </p>
            </li>
          );
        })}
      </ol>

      <p className="m-0 mt-4 border-t border-border-subtle pt-3 text-[12.5px] leading-relaxed text-text-secondary">
        <ProgressSummary task={task} />
      </p>
    </section>
  );
}

/**
 * The one-sentence "what does this mean for me" line. Split by claim
 * state (`getTaskClaim`) because the same `IN_PROGRESS` is a call to
 * action for the person who started it and a "pick something else" for
 * everyone else.
 */
function ProgressSummary({ task }: { task: TaskDetail }) {
  const claim = getTaskClaim(task);
  const progress = task.progress;
  const pr = progress?.pullRequest ?? null;

  const prLink =
    pr && pr.url ? (
      <>
        {" "}
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-text hover:text-accent"
        >
          View {pr.number !== null ? `pull request #${pr.number}` : "the pull request"}
        </a>
        .
      </>
    ) : null;

  if (task.status === "OPEN") {
    return <>Nobody has started this task yet — it&apos;s available to pick up.</>;
  }

  if (task.status === "IN_PROGRESS") {
    if (claim === "mine") {
      return (
        <>
          You started this
          {progress?.startedAt ? (
            <>
              {" "}
              <time dateTime={progress.startedAt}>{formatRelativeTime(progress.startedAt)}</time>
            </>
          ) : null}
          {progress?.branch ? (
            <>
              {" "}
              on branch <code className="font-mono text-[11.5px]">{progress.branch}</code>
            </>
          ) : null}
          . Run <code className="font-mono text-[11.5px]">dev submit</code> when your change is ready.
        </>
      );
    }
    if (claim === "other") {
      return <>Another contributor is working on this task. Pick a different one to start now.</>;
    }
    return <>This task is in progress.</>;
  }

  if (task.status === "IN_REVIEW") {
    return claim === "mine" ? (
      <>Your pull request is open and waiting on review.{prLink}</>
    ) : (
      <>A pull request is open for this task and waiting on review.{prLink}</>
    );
  }

  // DONE
  return claim === "done" && progress?.viewerIsAssignee ? (
    <>You completed this task.{prLink}</>
  ) : (
    <>This task is complete.{prLink}</>
  );
}
