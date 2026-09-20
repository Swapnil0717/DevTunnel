/**
 * The task-progress model shared by every place progress is shown: the
 * stage tracker on the task page and task contribute page
 * (`TaskProgressTracker`), the stage chips on Home's "Your tasks"
 * (`TaskRow`), and the project progress bar (`ProjectTaskProgress`).
 *
 * One list of stages, defined once, so the four surfaces can't drift into
 * calling the same status three different things
 * (Frontend_Development_Rules.txt rule 51).
 *
 * **Every stage here is a fact the backend recorded**, not something a
 * contributor ticked. `dev start` moves a task to `IN_PROGRESS`
 * (sql/030), `dev submit` opens a pull request and moves it to
 * `IN_REVIEW` (sql/031), and completion moves it to `DONE`. That is the
 * whole reason this model is built on `TaskStatus` and not on the private
 * checklist on the Contribute page — sql/027 is explicit that ticking a
 * step there is a claim nobody verified, so nothing built on it could be
 * shown as progress (rule 38).
 *
 * Note "PR submitted" means a pull request was *opened*, not merged;
 * DevTunnel doesn't observe the merge itself, so the copy never says
 * "merged" until the task is `DONE`.
 */

import type { TaskProgressCounts, TaskStatus } from "@/lib/tasks/types";
import type { TaskDetail } from "@/lib/tasks/types";

export interface TaskStage {
  status: TaskStatus;
  /** Short name used on the tracker, chips and legend. */
  label: string;
  /** One line on what being at this stage means. */
  description: string;
  /** Dot / segment color. Hex to match `AdminTaskStatusBadge`, which does the same. */
  color: string;
}

/** In lifecycle order — index in this array *is* the stage number. */
export const TASK_STAGES: readonly TaskStage[] = [
  {
    status: "OPEN",
    label: "Open",
    description: "Available to pick up",
    color: "#378ADD",
  },
  {
    status: "IN_PROGRESS",
    label: "Started",
    description: "Forked and being worked on",
    color: "#639922",
  },
  {
    status: "IN_REVIEW",
    label: "PR submitted",
    description: "Pull request open, waiting on review",
    color: "#AFA9EC",
  },
  {
    status: "DONE",
    label: "Done",
    description: "Completed",
    color: "#1D9E75",
  },
];

/** 0-based position of `status` in `TASK_STAGES`. Unknown values fall back to 0 rather than throwing. */
export function stageIndex(status: TaskStatus): number {
  const index = TASK_STAGES.findIndex((stage) => stage.status === status);
  return index === -1 ? 0 : index;
}

export function stageFor(status: TaskStatus): TaskStage {
  return TASK_STAGES[stageIndex(status)] as TaskStage;
}

/**
 * What the signed-in viewer's relationship to a task is. Drives both the
 * tracker's sentence and whether the Contribute page offers a way to
 * start it:
 *
 *  - `open`    — nobody has claimed it.
 *  - `mine`    — the viewer claimed it (`dev start` resumes; `dev submit` updates the PR).
 *  - `other`   — someone else claimed it, so `dev start` would be rejected.
 *  - `done`    — finished; nothing left to start.
 *  - `unknown` — the backend didn't send `progress` (frontend deployed
 *    ahead of the backend), so ownership can't be told. Callers treat this
 *    as "maybe yours" and don't hide the steps.
 */
export type TaskClaim = "open" | "mine" | "other" | "done" | "unknown";

export function getTaskClaim(task: Pick<TaskDetail, "status" | "progress">): TaskClaim {
  if (task.status === "DONE") return "done";
  if (task.status === "OPEN") return "open";
  if (!task.progress) return "unknown";
  return task.progress.viewerIsAssignee ? "mine" : "other";
}

/** Whole-number percent of a project's tasks that are done. `0` for a project with no tasks. */
export function donePercent(counts: TaskProgressCounts): number {
  if (counts.total <= 0) return 0;
  return Math.round((counts.done / counts.total) * 100);
}
