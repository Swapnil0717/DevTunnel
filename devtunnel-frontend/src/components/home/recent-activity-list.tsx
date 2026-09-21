import Link from "next/link";
import { SectionMessage } from "./section-message";
import { STAGE_CHIP_CLASSES } from "./task-row";
import { getRecentActivity } from "@/lib/home/api";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { stageFor } from "@/lib/tasks/progress";
import type { RecentActivity, RecentActivityType } from "@/lib/home/types";
import type { TaskStatus } from "@/lib/tasks/types";

/**
 * Each kind of activity is described with the same stage vocabulary and chip
 * colors as the rest of the app (`lib/tasks/progress.ts`, `TaskRow`) — so a
 * task the contributor started reads "Started" here, on "Your tasks" and on
 * the task page, not three different phrasings. The chip carries the meaning
 * in words, so nothing is conveyed by color alone (rule 43).
 */
const ACTIVITY_STAGE: Record<RecentActivityType, { status: TaskStatus; label: string }> = {
  TASK_STARTED: { status: "IN_PROGRESS", label: stageFor("IN_PROGRESS").label },
  PULL_REQUEST_SUBMITTED: { status: "IN_REVIEW", label: stageFor("IN_REVIEW").label },
  TASK_COMPLETED: { status: "DONE", label: stageFor("DONE").label },
  PROJECT_STARTED: { status: "IN_PROGRESS", label: "Project started" },
  PROJECT_JOINED: { status: "OPEN", label: "Joined project" },
};

/** Task-level events open the task; project-level ones (a claimed project) open the project. */
function activityHref(item: RecentActivity): string {
  return item.taskId
    ? `/projects/${item.projectSlug}/tasks/${item.taskId}`
    : `/projects/${item.projectSlug}`;
}

/** Second line under the title: where it happened, plus the PR number when there is one. */
function activityDetail(item: RecentActivity): string {
  const parts: string[] = [];
  parts.push(item.taskId ? item.projectName : "Project");
  if (item.type === "PULL_REQUEST_SUBMITTED" && item.pullRequest?.number) {
    parts.push(`PR #${item.pullRequest.number}`);
  }
  return parts.join(" · ");
}

/**
 * "Recently active" on Home — what the signed-in contributor has recently
 * done on DevTunnel: tasks started, pull requests submitted, tasks finished,
 * projects claimed. From `GET /users/me/activity`; every row is a fact the
 * backend recorded (see `src/db/userActivity.ts` there), and there is one row
 * per task/project showing its latest event, so a single task never fills the
 * list on its own.
 *
 * Like every other row on Home, the whole row is one link (to the task, or to
 * the project for project-level events); the PR number is plain text rather
 * than a nested link, and the time is a real `<time>` element (rule 46).
 */
export async function RecentActivityList() {
  const result = await getRecentActivity();

  if (result.status === "error") {
    return (
      <SectionMessage>
        Recent activity isn&apos;t available yet — check back soon.
      </SectionMessage>
    );
  }

  if (result.status === "empty") {
    return (
      <SectionMessage>
        No recent activity yet. Once you join a project or start a task, it&apos;ll show up here.
      </SectionMessage>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
      {result.data.map((item) => {
        const stage = ACTIVITY_STAGE[item.type];
        return (
          <li key={item.id}>
            <Link
              href={activityHref(item)}
              className="flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2.5 hover:bg-surface-raised"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11.5px] text-text-secondary">
                  {item.title}
                </span>
                <span className="block truncate text-[10px] text-text-faint">
                  {activityDetail(item)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span
                  className={`text-[10px] px-[7px] py-[2px] rounded-[5px] ${STAGE_CHIP_CLASSES[stage.status]}`}
                >
                  {stage.label}
                </span>
                <span className="text-[11px] text-text-faint font-mono">
                  <time dateTime={item.occurredAt}>{formatRelativeTime(item.occurredAt)}</time>
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
