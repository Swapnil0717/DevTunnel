import type { MyTask } from "./types";
import { stageIndex } from "@/lib/tasks/progress";

/**
 * Counts behind Home's three stat cards ("In progress" / "PRs submitted" /
 * "Tasks completed"). Deliberately built from the same `MyTask[]` that
 * `MyTasksList` already renders, rather than a new endpoint — there's no
 * `GET /users/me/stats`-style summary route, and these three numbers are
 * just a tally of a response the frontend already has. `ProfileStats`
 * (`lib/profile/*`) is the real, backend-computed lifetime stats surface;
 * this is only ever "what's on Home's rows right now".
 */
export type TaskCounts = {
  inProgress: number;
  inReview: number;
  done: number;
};

export function summarizeTasks(tasks: MyTask[]): TaskCounts {
  return {
    inProgress: tasks.filter((task) => task.status === "IN_PROGRESS").length,
    inReview: tasks.filter((task) => task.status === "IN_REVIEW").length,
    done: tasks.filter((task) => task.status === "DONE").length,
  };
}

/**
 * The one task to feature in the journey card, if any: whichever active
 * (not-yet-done) task most needs the viewer's attention. `IN_PROGRESS`
 * outranks `IN_REVIEW` — a task still being written needs the viewer more
 * than one already sitting in someone else's review queue — and ties break
 * on the most recently started task (`startedAt`, when the backend sent
 * it). Returns `null` when nothing is active, which the journey card reads
 * as "nothing to continue right now" rather than an error.
 */
export function featuredTask(tasks: MyTask[]): MyTask | null {
  const active = tasks.filter(
    (task) => task.status === "IN_PROGRESS" || task.status === "IN_REVIEW",
  );
  if (active.length === 0) return null;

  return [...active].sort((a, b) => {
    if (a.status !== b.status) {
      return stageIndex(a.status) - stageIndex(b.status);
    }
    const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
    const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
    return bTime - aTime;
  })[0]!;
}
