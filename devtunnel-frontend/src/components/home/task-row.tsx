import Link from "next/link";
import { TASK_STAGES, stageFor, stageIndex } from "@/lib/tasks/progress";
import type { TaskPullRequestRef, TaskStatus } from "@/lib/tasks/types";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { HOME_ROW } from "./styles";

/**
 * Chip colors per stage. Home no longer renders chips (the redesign shows the
 * stage as plain text), but the profile page's task list still imports this
 * map (`components/profile/profile-tasks-list.tsx`), so it stays exported
 * from here.
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
 * A task row on Home. The **mine** variant ("Your tasks") is the compact end
 * of the task-progress tracker: PR number (once one exists), a four-segment
 * mini bar, and the stage named in words — Open, Started, PR submitted or
 * Done — from the same stage list (`lib/tasks/progress.ts`) as the full
 * tracker on the task page and the project progress bar, so they can't
 * disagree. Done is the one stage drawn in the accent green.
 *
 * The mini bar is decorative (`aria-hidden`); the stage text carries the
 * meaning, so nothing is conveyed by color alone (rule 43). The whole row is
 * one link to the task page; `startedAt`, when sent, appears under the title
 * next to the project name.
 */
export function TaskRow(props: TaskRowProps) {
  const href = `/projects/${props.projectSlug}/tasks/${props.taskId}`;

  return (
    <Link href={href} className={HOME_ROW}>
      <span className="min-w-0 sm:flex-1">
        <span className="block truncate text-[13px] text-text">{props.title}</span>
        {props.variant === "recommended" && props.projectName ? (
          <span className="block truncate text-[12px] text-text-dim">{props.projectName}</span>
        ) : null}
        {props.variant === "mine" && (props.projectName || props.startedAt) ? (
          <span className="block truncate text-[12px] text-text-dim">
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
        <span className="text-[12px] text-status-success-label sm:whitespace-nowrap">
          Match · {props.match}
        </span>
      ) : (
        <span className="flex flex-none items-center gap-2.5">
          {props.status === "IN_REVIEW" && props.pullRequest?.number ? (
            <span className="font-mono text-[11.5px] text-text-dim">
              PR #{props.pullRequest.number}
            </span>
          ) : null}
          <span aria-hidden="true" className="flex gap-[3px]">
            {TASK_STAGES.map((stage, index) => (
              <span
                key={stage.status}
                className={`block h-[3px] w-3 rounded-sm ${
                  index <= stageIndex(props.status) ? "bg-accent" : "bg-[#262626]"
                }`}
              />
            ))}
          </span>
          <span
            className={`text-[12px] sm:min-w-[74px] sm:text-right ${
              props.status === "DONE" ? "text-status-success-label" : "text-[#C8C8C8]"
            }`}
          >
            {stageFor(props.status).label}
          </span>
        </span>
      )}
    </Link>
  );
}
