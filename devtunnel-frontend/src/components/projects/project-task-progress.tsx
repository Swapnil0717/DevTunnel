import { StatusDot } from "@/components/ui/status-dot";
import { TASK_STAGES, donePercent } from "@/lib/tasks/progress";
import type { TaskProgressCounts } from "@/lib/tasks/types";

/**
 * "X of Y tasks done" plus a segmented bar showing how the project's
 * tasks are spread across the four stages — done, PR submitted, started,
 * open — so a contributor can tell at a glance whether a project is
 * moving before they join it.
 *
 * The numbers come from `taskProgress` on `GET /projects/:slug`, which the
 * backend counts in the database rather than deriving from the (capped)
 * task list, so `total` always agrees with the "DevTunnel tasks" figure
 * beside it (rule 38). Nothing here is estimated: a stage with no tasks
 * simply has no segment, and a project with no tasks says so instead of
 * drawing an empty bar that reads as "0% done".
 *
 * Compact (`compact`) is the one-line-and-bar version used inside the
 * Task page's project section; the default adds the per-stage legend for
 * the project page's sidebar. Either way the bar is `aria-hidden` and the
 * same information is in text — the sentence, and the legend counts — so
 * nothing is conveyed by color alone (rule 43).
 */
export function ProjectTaskProgress({
  counts,
  compact = false,
}: {
  counts: TaskProgressCounts;
  compact?: boolean;
}) {
  if (counts.total <= 0) {
    return <p className="m-0 text-[12px] text-text-faint">No tasks on this project yet.</p>;
  }

  // Bar order runs from finished to untouched, left to right — the bar
  // "fills in" from the left as the project makes progress.
  const segments = [
    { stage: TASK_STAGES[3], count: counts.done },
    { stage: TASK_STAGES[2], count: counts.inReview },
    { stage: TASK_STAGES[1], count: counts.inProgress },
    { stage: TASK_STAGES[0], count: counts.open },
  ];

  const percent = donePercent(counts);

  return (
    <div>
      <p className="m-0 mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px] text-text-secondary">
        <span>
          <span className="font-medium text-text">{counts.done.toLocaleString()}</span> of{" "}
          {counts.total.toLocaleString()} {counts.total === 1 ? "task" : "tasks"} done
        </span>
        <span className="text-[11.5px] text-text-faint">{percent}%</span>
      </p>

      <div
        aria-hidden="true"
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-border-subtle"
      >
        {segments.map(({ stage, count }) =>
          stage && count > 0 ? (
            <span
              key={stage.status}
              className="block h-full"
              style={{ width: `${(count / counts.total) * 100}%`, backgroundColor: stage.color }}
            />
          ) : null,
        )}
      </div>

      {!compact ? (
        <ul className="m-0 mt-3 grid list-none grid-cols-2 gap-x-3 gap-y-1.5 p-0 text-[11.5px] text-text-secondary">
          {segments.map(({ stage, count }) =>
            stage ? (
              <li key={stage.status} className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-text-faint">
                  <StatusDot color={stage.color} />
                  {stage.label}
                </span>
                <span className="font-medium text-text-secondary">{count.toLocaleString()}</span>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
    </div>
  );
}
