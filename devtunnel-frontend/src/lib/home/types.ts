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

/**
 * What a contributor did on DevTunnel — one row of "Recently active" on Home,
 * from `GET /users/me/activity` (devtunnel-backend `src/db/userActivity.ts`,
 * which documents where each event comes from).
 *
 * Only four things are ever reported, each a fact the backend recorded:
 * a task started (`dev start`), a pull request submitted (`dev submit`), a
 * task finished, or a whole project claimed (`dev start --project`). There
 * is deliberately no "merged" event — see `lib/tasks/progress.ts`.
 *
 * The list is one row per task/project, showing its *latest* event, so a task
 * that was started and then submitted appears once, as "PR submitted".
 */
export type RecentActivityType =
  | "TASK_STARTED"
  | "PULL_REQUEST_SUBMITTED"
  | "TASK_COMPLETED"
  | "PROJECT_STARTED";

export type RecentActivity = {
  id: string;
  type: RecentActivityType;
  /** The task's title, or the project's name for project-level events. */
  title: string;
  projectSlug: string;
  projectName: string;
  /** `null` for project-level events — those link to the project page. */
  taskId: string | null;
  occurredAt: string; // ISO 8601
  /** Only present on `PULL_REQUEST_SUBMITTED`. */
  pullRequest?: { number: number | null; url: string | null } | null;
};

/**
 * One row of "Recommended tasks" — `GET /users/me/recommended-tasks`
 * (devtunnel-backend `listRecommendedTasksForProfile`): an open, unclaimed
 * task that fits the contributor's onboarding profile.
 *
 * `match` is the one true reason it was picked — the matching role
 * ("Backend Developer"), else the matching technology ("React"), else the
 * experience level ("Beginner level") — shown as "Match · {match}". It is
 * never a score or a role the contributor didn't actually match on.
 */
export type RecommendedTask = {
  taskId: string;
  title: string;
  projectSlug: string;
  projectName?: string;
  match: string;
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