import Link from "next/link";
import { TASK_STAGES, stageFor, stageIndex } from "@/lib/tasks/progress";
import type { TaskPullRequestRef, TaskStatus } from "@/lib/tasks/types";
import { formatRelativeTime } from "@/lib/home/format-relative-time";

/**
 * Chip colors per stage, matched to each stage's dot/segment color in
 * `TASK_STAGES` so the chip, the mini bar beside it and the tracker on
 * the task page all read as the same stage.
 */
export const STAGE_CHIP_CLASSES: Record<TaskStatus, string> = {
  OPEN: "bg-status-info-bg text-status-info-text",
  IN_PROGRESS: "bg-status-idle-bg text-status-idle-text",
  IN_REVIEW: "bg-tag-skill-bg text-tag-skill-text",
  DONE: "bg-status-success-bg text-status-success-label",
};

type TaskRowProps =
  | {
      variant: "recommended";
      taskId: string;
      title: string;
      projectSlug: string;
      /** Shown under the title so two tasks with similar titles can be told apart. */
      projectName?: string;
      /** Why it was recommended — the role, technology or level that matched. Shown as "Match · {match}". */
      match: string;
    }
  | {
      variant: "mine";
      taskId: string;
      title: string;
      projectSlug: string;
      status: TaskStatus;
      /** Shown under the title when the backend sent it, so two tasks with similar titles can be told apart. */
      projectName?: string;
      /** When `dev start` claimed it. Shown under the title alongside `projectName`. */
      startedAt?: string | null;
      /**
       * The PR `dev submit` opened, if any. Only its number is surfaced here
       * (as plain text, not a link) — the row is already one `Link` to the
       * task page, and nesting a second `<a>` to GitHub inside it would
       * break the single-link-per-row pattern every other Home row uses.
       * The actual "open on GitHub" link lives on the task page itself
       * (`TaskProgressTracker`).
       */
      pullRequest?: TaskPullRequestRef | null;
    };

/**
 * A task row on Home. The **mine** variant ("Your tasks") is the compact
 * end of the task-progress tracker: a four-segment mini bar plus a chip
 * naming the stage — Open, Started, PR submitted or Done — using the same
 * stage list (`lib/tasks/progress.ts`) as the full tracker on the task
 * page and the project progress bar, so the three can't disagree.
 *
 * The chip carries the stage in words; the mini bar is decorative
 * (`aria-hidden`), so nothing is conveyed by color alone (rule 43). The
 * whole row is one link to the task page, so the actual pull-request link
 * lives there rather than nested inside this one — here, once a task
 * reaches `IN_REVIEW`, only the PR number is surfaced as plain text next
 * to the chip. `startedAt`, when sent, appears under the title next to
 * the project name.
 */
export function TaskRow(props: TaskRowProps) {
  const href = `/projects/${props.projectSlug}/tasks/${props.taskId}`;

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2.5 hover:bg-surface-raised"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11.5px] text-text-secondary">{props.title}</span>
        {props.variant === "recommended" && props.projectName ? (
          <span className="block truncate text-[10px] text-text-faint">{props.projectName}</span>
        ) : null}
        {props.variant === "mine" && (props.projectName || props.startedAt) ? (
          <span className="block truncate text-[10px] text-text-faint">
            {props.projectName}
            {props.projectName && props.startedAt ? " · " : null}
            {props.startedAt ? (
              <>
                Started{" "}
                <time dateTime={props.startedAt}>{formatRelativeTime(props.startedAt)}</time>
              </>
            ) : null}
          </span>
        ) : null}
      </span>

      {props.variant === "recommended" ? (
        <span className="shrink-0 text-[10px] text-status-success-label">
          Match · {props.match}
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-2">
          {props.status === "IN_REVIEW" && props.pullRequest?.number ? (
            <span className="text-[10px] text-text-faint font-mono">
              PR #{props.pullRequest.number}
            </span>
          ) : null}
          <span aria-hidden="true" className="flex items-center gap-0.5">
            {TASK_STAGES.map((stage, index) => (
              <span
                key={stage.status}
                className="block h-1 w-2.5 rounded-full bg-border-subtle"
                style={
                  index <= stageIndex(props.status) ? { backgroundColor: stage.color } : undefined
                }
              />
            ))}
          </span>
          <span
            className={`text-[10px] px-[7px] py-[2px] rounded-[5px] ${STAGE_CHIP_CLASSES[props.status]}`}
          >
            {stageFor(props.status).label}
          </span>
        </span>
      )}
    </Link>
  );
}
