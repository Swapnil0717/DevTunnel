"use client";

import { useState } from "react";
import Link from "next/link";
import { STAGE_CHIP_CLASSES } from "@/components/home/task-row";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { stageFor } from "@/lib/tasks/progress";
import type { ProfileTask, ProfileTaskStage } from "@/lib/profile/types";

type Filter = "ALL" | ProfileTaskStage;

/**
 * Stage names come from `lib/tasks/progress.ts` — "Started", "PR submitted",
 * "Done" — so a task reads the same here as on Home's "Your tasks" and on the
 * task page. "Viewed" is the one stage that isn't a `TaskStatus`: it means the
 * contributor opened the task but hasn't started it.
 */
function stageLabel(stage: ProfileTaskStage): string {
  return stage === "VIEWED" ? "Viewed" : stageFor(stage).label;
}

const STAGE_CHIP: Record<ProfileTaskStage, string> = {
  VIEWED: "bg-surface-selected text-text-muted",
  IN_PROGRESS: STAGE_CHIP_CLASSES.IN_PROGRESS,
  IN_REVIEW: STAGE_CHIP_CLASSES.IN_REVIEW,
  DONE: STAGE_CHIP_CLASSES.DONE,
};

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "VIEWED", label: "Viewed" },
  { id: "IN_PROGRESS", label: "Started" },
  { id: "IN_REVIEW", label: "PR submitted" },
  { id: "DONE", label: "Done" },
];

const PAGE_SIZE = 15;

/**
 * What the contributor did on this task, in the order it happened — only the
 * steps that actually have a recorded time. A task that was opened, started
 * and then submitted reads "Viewed … · Started … · PR #12 submitted …".
 * "Submitted" means the pull request was *opened*, not merged: DevTunnel
 * doesn't observe the merge (`lib/tasks/progress.ts`).
 */
function timeline(task: ProfileTask): { key: string; label: string; at: string }[] {
  const steps: { key: string; label: string; at: string }[] = [];
  if (task.viewedAt) steps.push({ key: "viewed", label: "Viewed", at: task.viewedAt });
  if (task.startedAt) steps.push({ key: "started", label: "Started", at: task.startedAt });
  if (task.submittedAt) {
    steps.push({
      key: "submitted",
      label: task.pullRequest?.number ? `PR #${task.pullRequest.number} submitted` : "PR submitted",
      at: task.submittedAt,
    });
  }
  if (task.completedAt) steps.push({ key: "done", label: "Done", at: task.completedAt });
  return steps;
}

/**
 * The Profile page's **Tasks** tab — every task the signed-in contributor has
 * viewed, started, submitted for review, or finished, newest first, from
 * `GET /users/me/profile-activity`. One row per task, at the furthest stage it
 * reached, with the time of each step underneath.
 *
 * The filter row narrows by that stage. Every filter shows its count, so an
 * empty one is visibly empty before it's clicked, and the buttons are a real
 * `aria-pressed` group rather than color-coded chips (rule 43).
 *
 * Like every other list row in the app, each row is one link (to the task
 * page); the PR number is plain text rather than a nested link to GitHub,
 * which lives on the task page itself.
 *
 * A client component only for the filter and the "Show more" state — the data
 * arrives already fetched. `tasks === null` means the request failed and is
 * shown as that, never as "you haven't done anything yet".
 *
 * Relative times are computed from the clock, so the server render and the
 * browser can disagree by a second; `suppressHydrationWarning` on each `<time>`
 * covers that (the `dateTime` attribute is the real, stable value).
 */
export function ProfileTasksList({ tasks }: { tasks: ProfileTask[] | null }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (tasks === null) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface px-4 py-8 text-center text-[12.5px] text-text-dim">
        We couldn&apos;t load your tasks right now. Try refreshing the page.
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface px-4 py-8 text-center text-[12.5px] text-text-dim">
        <p className="m-0">You haven&apos;t opened or started any tasks yet.</p>
        <p className="m-0 mt-1.5">
          Tasks you view or start will show up here.{" "}
          <Link href="/tasks" className="text-text-muted underline underline-offset-2 hover:text-accent">
            Browse tasks
          </Link>
        </p>
      </div>
    );
  }

  const countFor = (id: Filter) =>
    id === "ALL" ? tasks.length : tasks.filter((task) => task.stage === id).length;

  const filtered = filter === "ALL" ? tasks : tasks.filter((task) => task.stage === filter);
  const visible = filtered.slice(0, visibleCount);

  function selectFilter(next: Filter) {
    setFilter(next);
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <div>
      <div role="group" aria-label="Filter tasks by stage" className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((option) => {
          const isActive = option.id === filter;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => selectFilter(option.id)}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                isActive
                  ? "border-border bg-surface-selected text-text"
                  : "border-border-subtle bg-surface text-text-dim hover:text-text-muted"
              }`}
            >
              {option.label} <span className="text-text-faint">{countFor(option.id)}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border-subtle bg-surface px-4 py-6 text-center text-[12.5px] text-text-dim">
          No tasks at this stage yet.
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Your tasks">
          {visible.map((task) => (
            <li key={task.taskId}>
              <Link
                href={`/projects/${task.projectSlug}/tasks/${task.taskId}`}
                className="flex flex-col gap-1.5 rounded-lg bg-surface px-3 py-2.5 hover:bg-surface-raised sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] text-text-secondary">{task.title}</span>
                  <span className="block text-[10px] leading-relaxed text-text-faint">
                    {task.projectName}
                    {timeline(task).map((step) => (
                      <span key={step.key}>
                        {" · "}
                        {step.label}{" "}
                        <time dateTime={step.at} suppressHydrationWarning>
                          {formatRelativeTime(step.at)}
                        </time>
                      </span>
                    ))}
                  </span>
                </span>

                <span
                  className={`shrink-0 self-start rounded-[5px] px-[7px] py-[2px] text-[10px] sm:self-center ${STAGE_CHIP[task.stage]}`}
                >
                  {stageLabel(task.stage)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {filtered.length > visibleCount ? (
        <button
          type="button"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
          className="mt-3 w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-[12px] text-text-muted hover:bg-surface-raised"
        >
          Show more ({filtered.length - visibleCount} remaining)
        </button>
      ) : null}
    </div>
  );
}
