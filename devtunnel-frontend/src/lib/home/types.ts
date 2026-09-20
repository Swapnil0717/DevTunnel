import type { TaskPullRequestRef, TaskStatus as DevtunnelTaskStatus } from "@/lib/tasks/types";

export type ProjectSummary = {
  slug: string;
  name: string;
  description: string;
  primaryTech: string;
  matchPercent?: number;
  matchRole?: string; // e.g. "Backend Developer"
  repositoryFullName?: string; // "owner/repo" — only present when the project has one recorded
};

export type ActiveProjectSummary = {
  slug: string;
  name: string;
  commitCount: number;
  lastActiveAt: string; // ISO 8601
};

export type RecommendedTask = {
  taskId: string;
  title: string;
  projectSlug: string;
  role: string;
};

/**
 * A claimed task's stage. This is the task's own DevTunnel lifecycle
 * (`devtunnel.task_status`) — the same four values the Tasks pages and the
 * task-progress tracker use — not a separate "TODO / in progress / in
 * review" vocabulary. It used to be its own three-value type, which could
 * not represent a finished task and named the first stage differently
 * from everywhere else.
 */
export type TaskStatus = DevtunnelTaskStatus;

/**
 * One row of "Your tasks" — `GET /users/me/tasks` (devtunnel-backend
 * `src/routes/tasks.ts`). The first four fields are what this type has
 * always carried; `projectName`, `startedAt` and `pullRequest` come from
 * the same response and let the row show which project a task is in and
 * link to its pull request. All three are optional so a row from a backend
 * that predates them still renders.
 */
export type MyTask = {
  taskId: string;
  title: string;
  projectSlug: string;
  status: TaskStatus;
  projectName?: string;
  startedAt?: string | null;
  pullRequest?: TaskPullRequestRef | null;
};