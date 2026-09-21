export type ContributionDay = {
  date: string; // YYYY-MM-DD
  count: number;
  /**
   * Whether `date` is actually inside the month being viewed. Weeks are
   * always full Sunday-start 7-day rows (see devtunnel-backend
   * src/lib/devtunnelActivity.ts / markMonthMembership in
   * src/routes/contributions.ts) so every `days[i]` lines up with its
   * real weekday — the first/last week's spillover days into the
   * adjacent month are kept as placeholders (`inMonth: false`, `count: 0`)
   * rather than dropped, since dropping them would shift every later day
   * in the week out of its correct weekday row.
   */
  inMonth: boolean;
};

export type ContributionWeek = {
  days: ContributionDay[];
};

/**
 * Fields shared by both the GitHub-backed month calendar and the
 * DevTunnel-native one — same grid shape, different data source. See
 * `ContributionCalendar` (components/profile/contribution-calendar.tsx),
 * which renders either one from this common shape.
 */
export type BaseContributionMonth = {
  month: string; // YYYY-MM
  totalContributions: number;
  weeks: ContributionWeek[];
  canGoPrevious: boolean;
  canGoNext: boolean;
};

/** `GET /users/me/contributions` (devtunnel-backend src/routes/contributions.ts). */
export type ContributionMonth = BaseContributionMonth & {
  githubUsername: string;
};

/**
 * `GET /users/me/contributions/devtunnel`
 * (devtunnel-backend src/routes/devtunnelStats.ts) — same shape as
 * `ContributionMonth` minus `githubUsername`, since this is always the
 * caller's own DevTunnel activity, never an external account.
 */
export type DevTunnelContributionMonth = BaseContributionMonth;

/** Shared by both the GitHub 365-day summary and the DevTunnel one. */
export type ContributionSummary = {
  totalContributions: number;
  fromDate: string; // ISO 8601
  toDate: string; // ISO 8601
};

/**
 * `GET /users/me/devtunnel-stats` (devtunnel-backend
 * src/routes/devtunnelStats.ts) — DevTunnel-native profile stats, all
 * backed by real tables (sql/004_add_devtunnel_contributions.sql).
 */
export type DevTunnelStats = {
  projectsCreated: number;
  projectsMaintaining: number;
  tasksCompleted: number;
  pullRequestsMerged: number;
  isMaintainer: boolean;
};

/**
 * The profile page's "30-day milestones" section
 * (components/profile/milestone-track.tsx). `GET
 * /users/me/contributions/milestones` (devtunnel-backend
 * src/routes/devtunnelStats.ts) — see that route's comment for what
 * counts as an "active day" and devtunnel-backend src/lib/milestones.ts
 * for the checkpoint thresholds and bonus goal targets.
 */
export type MilestoneDay = {
  date: string; // YYYY-MM-DD
  active: boolean;
};

export type MilestoneCheckpoint = {
  id: string;
  label: string;
  threshold: number;
  iconId: "seedling" | "flame" | "bolt" | "trophy" | "crown";
  reached: boolean;
  daysRemaining: number;
};

export type MilestoneBonusGoal = {
  id: "tasks" | "pullRequests";
  label: string;
  current: number;
  target: number;
  reached: boolean;
};

export type MilestoneWindow = {
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
  windowDays: number;
  activeDayCount: number;
  days: MilestoneDay[];
  checkpoints: MilestoneCheckpoint[];
  nextCheckpoint: MilestoneCheckpoint | null;
  bonusGoals: MilestoneBonusGoal[];
};

/**
 * The Profile page's **Projects** and **Tasks** tabs —
 * `GET /users/me/profile-activity` (devtunnel-backend
 * src/routes/profileActivity.ts). `src/db/profileActivity.ts` there
 * documents where every field comes from; in short, each one is a fact a
 * table already records (a button press, `dev start`, `dev submit`, a task
 * reaching `DONE`, a page view), never something inferred or self-reported.
 */

/**
 * The furthest stage the viewer reached on a task. `VIEWED` is "opened the
 * task page, hasn't started it"; the other three are `TaskStatus`
 * (`lib/tasks/types.ts`) for a task the viewer claimed — the same lifecycle
 * the task-progress tracker and Home's "Your tasks" use, so a task reads the
 * same everywhere (`lib/tasks/progress.ts`).
 */
export type ProfileTaskStage = "VIEWED" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";

export type ProfileTask = {
  taskId: string;
  title: string;
  projectSlug: string;
  projectName: string;
  stage: ProfileTaskStage;
  /** Last time the viewer opened the task page. */
  viewedAt: string | null; // ISO 8601
  /** `dev start`. */
  startedAt: string | null;
  /** `dev submit` — when the pull request was opened. Opened, not merged. */
  submittedAt: string | null;
  /** The task reached `DONE`. */
  completedAt: string | null;
  pullRequest: { number: number | null; url: string | null } | null;
  /** The newest of the timestamps above. */
  occurredAt: string;
};

/**
 * What the entry is, which decides its link and its label:
 *  - `project`        — an onboarded DevTunnel project (`/projects/:slug`)
 *  - `tool`           — an onboarded DevTunnel open source tool (`/opensource-tools/:slug`)
 *  - `github-project` — a raw GitHub catalog repository joined from `/github-projects`
 *  - `github-tool`    — one joined from `/github-open-source-tools`
 */
export type ProfileProjectKind = "project" | "tool" | "github-project" | "github-tool";

export type ProfileProjectTaskCounts = {
  /** Tasks the viewer opened but hasn't started. */
  viewed: number;
  inProgress: number;
  inReview: number;
  done: number;
};

export type ProfileProject = {
  id: string;
  kind: ProfileProjectKind;
  slug: string;
  name: string;
  primaryTech: string | null;
  repositoryFullName: string | null;
  /** When they pressed Contribute. `null` when they're contributing without ever having joined (e.g. started a task from the CLI). */
  joinedAt: string | null;
  /** `CONTRIBUTING` once there's work in it (a task started/submitted/finished); `JOINED` is intent only. */
  status: "JOINED" | "CONTRIBUTING";
  /** Only for `kind: "project"` — tools and raw GitHub repositories have no DevTunnel tasks. */
  taskCounts: ProfileProjectTaskCounts | null;
  lastActivityAt: string;
};

export type ProfileActivity = {
  projects: ProfileProject[];
  tasks: ProfileTask[];
};
