import Link from "next/link";
import { HomeMessage } from "./home-message";
import { getRecentActivity } from "@/lib/home/api";
import { formatCompactRelativeTime } from "@/lib/home/format-compact-time";
import { stageFor } from "@/lib/tasks/progress";
import type { RecentActivity, RecentActivityType } from "@/lib/home/types";

/**
 * Each kind of activity is described with the same stage vocabulary as the
 * rest of the app (`lib/tasks/progress.ts`, `TaskRow`) — so a task the
 * contributor started reads "Started" here, on "Your tasks" and on the task
 * page, not three different phrasings. The label carries the meaning in
 * words; Done is the one stage drawn in accent green, so nothing is conveyed
 * by color alone (rule 43).
 */
const ACTIVITY_LABEL: Record<RecentActivityType, string> = {
  TASK_STARTED: stageFor("IN_PROGRESS").label,
  PULL_REQUEST_SUBMITTED: stageFor("IN_REVIEW").label,
  TASK_COMPLETED: stageFor("DONE").label,
  PROJECT_STARTED: "Project started",
  PROJECT_JOINED: "Joined project",
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
 * Drawn as the redesign's timeline: a hairline down the left with one dot per
 * row — filled for the most recent event, hollow for the rest. The line and
 * dots are decoration (`aria-hidden`, or a CSS pseudo-element); the list is
 * still a plain `<ul>` in newest-first order.
 *
 * Like every other row on Home, the whole row is one link (to the task, or to
 * the project for project-level events); the PR number is plain text rather
 * than a nested link, and the time is a real `<time>` element (rule 46).
 */
export async function RecentActivityList() {
  const result = await getRecentActivity();

  if (result.status === "error") {
    return (
      <HomeMessage>
        Recent activity isn&apos;t available yet — check back soon.
      </HomeMessage>
    );
  }

  if (result.status === "empty") {
    return (
      <HomeMessage>
        No recent activity yet. Once you join a project or start a task, it&apos;ll show up here.
      </HomeMessage>
    );
  }

  return (
    <ul className="relative m-0 list-none overflow-hidden rounded-[10px] border border-[#1F1F1F] bg-[#0E0E0E] py-1.5 before:absolute before:bottom-[22px] before:left-[22px] before:top-[22px] before:w-px before:bg-border before:content-['']">
      {result.data.map((item, index) => (
        <li key={item.id} className="relative">
          <span
            aria-hidden="true"
            className={`absolute left-[17px] top-1/2 -mt-[5px] h-[11px] w-[11px] rounded-full ${
              index === 0
                ? "border-2 border-[#0E0E0E] bg-accent"
                : "border border-[#3A3A3A] bg-[#0E0E0E]"
            }`}
          />
          <Link
            href={activityHref(item)}
            className="flex items-center justify-between gap-3 py-2.5 pl-11 pr-4 transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-offset-[-2px]"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px] text-text">{item.title}</span>
              <span className="block truncate text-[12px] text-text-dim">
                {activityDetail(item)}
              </span>
            </span>
            <span className="flex flex-none items-center gap-3.5">
              <span
                className={`text-[12px] ${
                  item.type === "TASK_COMPLETED" ? "text-status-success-label" : "text-[#C8C8C8]"
                }`}
              >
                {ACTIVITY_LABEL[item.type]}
              </span>
              <time
                dateTime={item.occurredAt}
                className="min-w-[44px] text-right font-mono text-[11.5px] text-text-dim"
              >
                {formatCompactRelativeTime(item.occurredAt)}
              </time>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
