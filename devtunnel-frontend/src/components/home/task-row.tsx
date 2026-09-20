import Link from "next/link";
import { TASK_STAGES, stageFor, stageIndex } from "@/lib/tasks/progress";
import type { TaskStatus } from "@/lib/tasks/types";

/**
 * Chip colors per stage, matched to each stage's dot/segment color in
 * `TASK_STAGES` so the chip, the mini bar beside it and the tracker on
 * the task page all read as the same stage.
 */
const STAGE_CHIP_CLASSES: Record<TaskStatus, string> = {
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
      role: string;
    }
  | {
      variant: "mine";
      taskId: string;
      title: string;
      projectSlug: string;
      status: TaskStatus;
      /** Shown under the title when the backend sent it, so two tasks with similar titles can be told apart. */
      projectName?: string;
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
 * whole row is one link to the task page, so the pull request link lives
 * there rather than nested inside this one.
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
        {props.variant === "mine" && props.projectName ? (
          <span className="block truncate text-[10px] text-text-faint">{props.projectName}</span>
        ) : null}
      </span>

      {props.variant === "recommended" ? (
        <span className="shrink-0 text-[10px] text-status-success-label">
          Match · {props.role}
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-2">
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
