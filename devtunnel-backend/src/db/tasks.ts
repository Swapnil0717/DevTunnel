import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminTaskGithubIssueRef,
  AdminTaskListRow,
  AdminTaskStatus,
  DeveloperRole,
  ExperienceLevel,
} from "../types";
import { LIST_COLUMNS, contributorCounts, flattenTechStack, toGithubIssueRef } from "./adminTasks";

/** Re-exported so `routes/tasks.ts` (`POST /tasks/:id/start`) doesn't need to reach into `./adminTasks` directly for this one type. */
export type { AdminTaskListRow };

/**
 * Contributor — Tasks (`/tasks` — "Tasks" in `AppSidebar` / `AppBottomNav`,
 * devtunnel-frontend's `lib/tasks/{types,api}.ts`). Backs `GET /tasks`
 * (src/routes/tasks.ts), the contributor-facing sibling of
 * `GET /admin/tasks` (src/routes/admin/tasks.ts / src/db/adminTasks.ts).
 *
 * Reads the exact same `devtunnel.admin_task_list` view (sql/013) with the
 * exact same column list and row-mapping helpers (`flattenTechStack`,
 * `toGithubIssueRef`, `contributorCounts` — all exported from
 * src/db/adminTasks.ts) rather than a second, divergent query — a task's
 * project/GitHub-issue/contributor-count fields must be identical wherever
 * a task list is rendered (Backend_Development_Rules.txt rule 51: don't
 * implement the same logic twice).
 *
 * Two differences from the admin list, both deliberate:
 *  - Always excludes soft-deleted tasks (`deleted_at is null`) — a
 *    contributor browsing for something to work on has no use for a task
 *    DevTunnel no longer provides (the admin-only "Deleted in DevTunnel"
 *    view exists on the Admin Portal, not here).
 *  - Trims each row to the contributor-safe `TaskSummary` shape below —
 *    no `submissionCount` (an admin throughput metric), no project `id`,
 *    no project `author`, and adds the project's own flattened tech stack
 *    onto the project reference (`TaskProjectRef.techStack`) since
 *    `TasksExplorer`'s filter bar needs it, matching the already-shipped
 *    frontend contract in devtunnel-frontend/src/lib/tasks/types.ts
 *    field-for-field.
 */

/** The project a task belongs to, trimmed to what `TasksTable` and `TasksExplorer`'s filter bar need. */
export interface TaskProjectRef {
  slug: string;
  name: string;
  repositoryFullName: string;
  repositoryUrl: string;
  techStack: string[];
}

/** Same shape as `AdminTaskGithubIssueRef` — re-exported under the contributor-facing name for clarity at call sites. */
export type TaskGithubIssueRef = AdminTaskGithubIssueRef;

export type TaskStatus = AdminTaskStatus;

/** A single row of the contributor Tasks list — mirrors `Task` in devtunnel-frontend's `lib/tasks/types.ts` exactly. */
export interface TaskSummary {
  id: string;
  slug: string | null;
  title: string;
  project: TaskProjectRef;
  githubIssue: TaskGithubIssueRef | null;
  roles: DeveloperRole[];
  difficulty: ExperienceLevel | null;
  techStack: string[];
  status: TaskStatus;
  activeContributorCount: number;
  completedContributorCount: number;
}

/**
 * `GET /projects/:projectSlug/tasks/:taskId` (the contributor-facing
 * "View Task" destination `TaskRow` and `TasksTable` already link to —
 * devtunnel-frontend's `components/home/task-row.tsx` /
 * `components/tasks/tasks-table.tsx`). Extends `TaskSummary` with the
 * task's own curated description, the same two detail-only fields
 * `AdminTaskDetail` adds over `AdminTaskSummary` (`customDescription`,
 * `githubIssueBody`) — a contributor deciding whether to pick up a task
 * needs to actually read it, not just see the summary row.
 *
 * Deliberately omits `submissionCount` and `deletedAt`, same as
 * `TaskSummary` itself: `submissionCount` is an admin throughput metric,
 * and a soft-deleted task never reaches this shape at all (see
 * `getTaskDetailByProjectAndId` below — it 404s instead).
 */
export interface TaskDetail extends TaskSummary {
  /** Only set when the task was onboarded/edited with a DevTunnel-specific description layered on the issue. */
  customDescription: string | null;
  /** The original GitHub issue body, exactly as imported — never rewritten (rule: "Do not modify the original GitHub issue"). */
  githubIssueBody: string | null;
}

function toTaskDetail(row: AdminTaskListRow): TaskDetail {
  return {
    ...toTaskSummary(row),
    customDescription: row.custom_description,
    githubIssueBody: row.github_issue_snapshot?.body ?? null,
  };
}

function toTaskSummary(row: AdminTaskListRow): TaskSummary {
  const { activeContributorCount, completedContributorCount } = contributorCounts(row);
  const techStack = flattenTechStack(row.project_tech_stack);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    project: {
      slug: row.project_slug,
      name: row.project_name,
      repositoryFullName: row.project_github_full_name ?? "",
      repositoryUrl: row.project_repo_url ?? "",
      techStack,
    },
    githubIssue: toGithubIssueRef(row),
    roles: row.roles ?? [],
    difficulty: row.difficulty,
    techStack,
    status: row.status,
    activeContributorCount,
    completedContributorCount,
  };
}

/**
 * The signed-in contributor's own onboarding answers (`devtunnel.users` —
 * sql/002/019, `PATCH /auth/onboarding`), used only to power
 * `?recommended=true` below. Passed in by the route from `c.get("user")`
 * (already attached by `requireAuth` — src/middleware/auth.ts) rather than
 * re-queried here, since `AuthUser` already carries every onboarding field
 * this needs.
 */
export interface ContributorProfile {
  developerRoles: DeveloperRole[];
  experienceLevel: ExperienceLevel | null;
  technologies: string[];
}

export interface ListTasksOptions {
  /** Max rows to return per page (already validated by the route's Zod schema). */
  limit: number;
  /** Keyset cursor — return rows strictly older than this `created_at`. */
  before: string | null;
  /**
   * Exact-match filters, validated against the same `DeveloperRole` /
   * `ExperienceLevel` / `AdminTaskStatus` enums the onboarding wizard
   * itself uses (never a second, invented vocabulary) — mirrors the
   * Role / Difficulty / Status filters `TasksExplorer` already exposes.
   * Exception: `role: "FULL_STACK"` matches any task with at least one
   * role tagged, not only tasks literally tagged FULL_STACK — same
   * "can handle everything" reasoning `TasksExplorer` documents for its
   * own `isFullStack` bypass, and the same exception `matchProfile` below
   * applies for a full-stack contributor's onboarding profile.
   */
  role?: DeveloperRole;
  difficulty?: ExperienceLevel;
  status?: AdminTaskStatus;
  projectSlug?: string;
  /** Case-insensitive match against one flattened tech-stack tag (e.g. "React"). */
  techStack?: string;
  /** Case-insensitive free-text match against title, project, repository, GitHub issue, and tech stack — same haystack `TasksExplorer` already searches client-side. */
  q?: string;
  /**
   * When set, only tasks that overlap this contributor's own onboarding
   * profile are returned — a task matches when its `roles` intersect the
   * contributor's `developerRoles`, its `difficulty` equals the
   * contributor's `experienceLevel`, or its tech stack intersects the
   * contributor's `technologies`. Exception: a contributor whose
   * `developerRoles` includes `FULL_STACK` matches on any task that has
   * *any* role tagged at all, not just tasks literally tagged FULL_STACK —
   * a full-stack contributor can pick up frontend-only/backend-only/etc.
   * tasks too, same reasoning `TasksExplorer` documents for its own
   * `isFullStack` bypass on the frontend. Backs `GET /tasks?recommended=true`.
   */
  matchProfile?: ContributorProfile;
}

export interface TasksPage {
  tasks: TaskSummary[];
  /** Pass as `before` on the next request to fetch the following page. `null` when there are no more rows. */
  nextCursor: string | null;
}

/**
 * Upper bound on how many active tasks one `?recommended=true`, `?q=`, or
 * `?techStack=` request will scan. Those three filters match against
 * values that live inside `project_tech_stack` (jsonb) or free text rather
 * than an indexed column, so — same posture `GET /issues` already takes
 * for its own in-memory keyset pagination over a bounded scan — this reads
 * a bounded, newest-first window and filters/paginates it in memory rather
 * than pushing those specific filters into SQL. 2,000 active tasks is
 * comfortably above any real installation's task list today; if that ever
 * changes, promoting the flattened tech-stack tags to their own indexed
 * column (or a Postgres function) would let this go back to pure
 * SQL-side keyset pagination the way `role` / `difficulty` / `status` /
 * `projectSlug` already do below.
 */
const IN_MEMORY_SCAN_LIMIT = 2000;

/**
 * Keyset-paginated read of every active (non-deleted) DevTunnel task,
 * newest first, optionally narrowed by role / difficulty / status /
 * project / tech stack / free-text search / the caller's own onboarding
 * profile. Backs `GET /tasks` (devtunnel-frontend's `lib/tasks/api.ts`).
 *
 * `role`, `difficulty`, `status`, and `projectSlug` are plain equality/
 * overlap checks against indexed columns, so — when none of the
 * memory-only filters (`techStack`, `q`, `matchProfile`, or `role:
 * "FULL_STACK"` — see below) are requested — this takes the fast path:
 * real SQL-side keyset pagination, identical in shape to `listAdminTasks`
 * (src/db/adminTasks.ts). The moment a memory-only filter is present, this
 * falls back to the bounded scan + in-memory filter/paginate path
 * described on `IN_MEMORY_SCAN_LIMIT` above — same trade-off `GET /issues`
 * already makes for its own list.
 */
export async function listTasks(
  supabase: SupabaseClient,
  options: ListTasksOptions,
): Promise<TasksPage> {
  // `role=FULL_STACK` gets the same "any role tagged counts" bypass
  // `matchProfile` applies below, for the same reason: a Full Stack
  // contributor's own explicit Role filter should still surface every
  // frontend-only/backend-only/etc. task, not just ones literally tagged
  // FULL_STACK. That can't be expressed as a plain `overlaps` equality
  // check against the indexed `roles` column, so it rides the existing
  // in-memory slow path instead of a new SQL operator.
  const isFullStackRoleFilter = options.role === "FULL_STACK";

  const needsInMemoryFiltering =
    options.techStack !== undefined ||
    options.q !== undefined ||
    options.matchProfile !== undefined ||
    isFullStackRoleFilter;

  let query = supabase
    .from("admin_task_list")
    .select(LIST_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (options.status) query = query.eq("status", options.status);
  if (options.difficulty) query = query.eq("difficulty", options.difficulty);
  if (options.projectSlug) query = query.eq("project_slug", options.projectSlug);
  // Skip the literal overlaps check for FULL_STACK — it's resolved
  // in-memory below instead, against every role-tagged task.
  if (options.role && !isFullStackRoleFilter) query = query.overlaps("roles", [options.role]);

  if (!needsInMemoryFiltering) {
    // Fast path — pure SQL-side keyset pagination, same pattern as
    // `listAdminTasks`: fetch one extra row to detect another page
    // without a separate COUNT query.
    query = query.limit(options.limit + 1);
    if (options.before) {
      query = query.lt("created_at", options.before);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to load task list: ${error.message}`);

    const rows = (data ?? []) as unknown as AdminTaskListRow[];
    const hasMore = rows.length > options.limit;
    const page = hasMore ? rows.slice(0, options.limit) : rows;

    return {
      tasks: page.map(toTaskSummary),
      nextCursor: hasMore ? (page[page.length - 1] as AdminTaskListRow).created_at : null,
    };
  }

  // Slow path — bounded scan, then filter/paginate in memory (see
  // `IN_MEMORY_SCAN_LIMIT`'s own comment for why techStack/q/matchProfile
  // can't be pushed into this query).
  query = query.limit(IN_MEMORY_SCAN_LIMIT);
  const { data, error } = await query;
  if (error) throw new Error(`Failed to load task list: ${error.message}`);

  let rows = (data ?? []) as unknown as AdminTaskListRow[];

  if (isFullStackRoleFilter) {
    rows = rows.filter((row) => (row.roles ?? []).length > 0);
  }

  if (options.techStack) {
    const needle = options.techStack.toLowerCase();
    rows = rows.filter((row) =>
      flattenTechStack(row.project_tech_stack).some((tag) => tag.toLowerCase() === needle),
    );
  }

  if (options.q) {
    const needle = options.q.toLowerCase();
    rows = rows.filter((row) => {
      const haystack = [
        row.title,
        row.project_name,
        row.project_github_full_name ?? "",
        row.github_issue_snapshot?.title ?? "",
        row.github_issue_number !== null ? `#${row.github_issue_number}` : "",
        ...flattenTechStack(row.project_tech_stack),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }

  if (options.matchProfile) {
    const { developerRoles, experienceLevel, technologies } = options.matchProfile;
    const technologiesLower = new Set(technologies.map((t) => t.toLowerCase()));

    // A Full Stack contributor can pick up a frontend-only, backend-only,
    // docs, testing, or DevOps task just as well as one tagged FULL_STACK —
    // so, same reasoning `TasksExplorer` documents for its own `isFullStack`
    // client-side bypass (devtunnel-frontend's
    // components/tasks/tasks-explorer.tsx), a task with *any* roles tagged
    // at all counts as a role match for them instead of requiring the
    // literal "FULL_STACK" tag. Non-full-stack contributors keep the exact
    // overlap check.
    const isFullStack = developerRoles.includes("FULL_STACK");

    rows = rows.filter((row) => {
      const roleMatch = isFullStack
        ? (row.roles ?? []).length > 0
        : (row.roles ?? []).some((role) => developerRoles.includes(role));
      const difficultyMatch = experienceLevel !== null && row.difficulty === experienceLevel;
      const techMatch = flattenTechStack(row.project_tech_stack).some((tag) =>
        technologiesLower.has(tag.toLowerCase()),
      );
      return roleMatch || difficultyMatch || techMatch;
    });
  }

  // Rows are already newest-first from the SQL `order` above, and none of
  // the in-memory filters change relative order — the same in-memory
  // keyset pagination `GET /issues` uses over its own bounded/filtered
  // result set.
  const afterCursor = options.before ? rows.filter((row) => row.created_at < options.before!) : rows;
  const hasMore = afterCursor.length > options.limit;
  const page = hasMore ? afterCursor.slice(0, options.limit) : afterCursor;

  return {
    tasks: page.map(toTaskSummary),
    nextCursor: hasMore ? (page[page.length - 1] as AdminTaskListRow).created_at : null,
  };
}

/**
 * Single-task detail lookup backing
 * `GET /projects/:projectSlug/tasks/:taskId` (src/routes/tasks.ts) — the
 * contributor-facing counterpart to `getAdminTaskDetailById`
 * (src/db/adminTasks.ts). Matches on `id` **and** `project_slug`
 * together, not `id` alone: the URL a contributor lands on is scoped to
 * a project (`/projects/:projectSlug/tasks/:taskId`), so a task id that
 * exists but belongs to a *different* project's slug is treated as "not
 * found here" and 404s — same as a real id that doesn't exist at all —
 * rather than silently ignoring the project segment and serving the
 * task anyway.
 *
 * Returns `null` for a task that doesn't exist, belongs to a different
 * project, or has been soft-deleted — a contributor has no more use for
 * a deleted task's detail page than `listTasks` gives them a use for it
 * in the list (`deleted_at is null` there; the same exclusion here, just
 * expressed as "not found" instead of "filtered out of a list").
 */
export async function getTaskDetailByProjectAndId(
  supabase: SupabaseClient,
  projectSlug: string,
  taskId: string,
): Promise<TaskDetail | null> {
  const { data, error } = await supabase
    .from("admin_task_list")
    .select(LIST_COLUMNS)
    .eq("id", taskId)
    .eq("project_slug", projectSlug)
    .maybeSingle<AdminTaskListRow>();

  if (error) throw new Error(`Failed to load task: ${error.message}`);
  if (!data || data.deleted_at) return null;

  return toTaskDetail(data);
}

/**
 * Single-task lookup by id alone (no project-slug scoping) — what
 * `POST /tasks/:id/start` (src/routes/tasks.ts) needs to resolve a task
 * id from the CLI into its project's GitHub repo, before it has (or
 * needs) a project slug on hand. Returns the raw `AdminTaskListRow`
 * rather than the trimmed `TaskDetail`/`TaskSummary` shapes above — the
 * caller needs fields (`project_github_owner`, `project_github_full_name`,
 * `assignee_*`) neither of those contributor-facing shapes carries.
 *
 * Returns `null` for a task that doesn't exist or has been soft-deleted —
 * same "not found" treatment `getTaskDetailByProjectAndId` gives a
 * deleted task.
 */
export async function getTaskById(
  supabase: SupabaseClient,
  taskId: string,
): Promise<AdminTaskListRow | null> {
  const { data, error } = await supabase
    .from("admin_task_list")
    .select(LIST_COLUMNS)
    .eq("id", taskId)
    .maybeSingle<AdminTaskListRow>();

  if (error) throw new Error(`Failed to load task: ${error.message}`);
  if (!data || data.deleted_at) return null;

  return data;
}

export interface StartTaskResult {
  status: "ok";
  task: {
    id: string;
    status: AdminTaskStatus;
    assigneeId: string;
    assigneeStartedAt: string;
    assigneeForkFullName: string;
    assigneeBranch: string;
  };
}

export type StartTaskOutcome =
  | StartTaskResult
  | { status: "not_found" }
  | { status: "already_claimed" }
  | { status: "already_done" };

interface StartTaskRpcRow {
  id: string;
  status: AdminTaskStatus;
  assignee_id: string;
  assignee_started_at: string;
  assignee_fork_full_name: string;
  assignee_branch: string;
}

/**
 * Claims `taskId` for `userId` — the write path `dev start`
 * (`POST /tasks/:id/start`) uses after it has already created/found the
 * contributor's fork and decided on a branch name. All of the actual
 * claim logic (locking, idempotent-resume-for-the-same-user, rejecting a
 * different user or an already-done task) lives in
 * `devtunnel.start_task()` (sql/030) — this function's only job is
 * turning that function's raised exceptions into a typed outcome the
 * route can map to the right HTTP status, same pattern
 * `completeSubmissionDraft` (db/submissionDrafts.ts) already uses for
 * `complete_user_submission`.
 */
export async function startTask(
  supabase: SupabaseClient,
  taskId: string,
  userId: string,
  forkFullName: string,
  branch: string,
): Promise<StartTaskOutcome> {
  const { data, error } = await supabase.rpc("start_task", {
    p_task_id: taskId,
    p_user_id: userId,
    p_fork_full_name: forkFullName,
    p_branch: branch,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("TASK_NOT_FOUND")) return { status: "not_found" };
    if (message.includes("TASK_ALREADY_CLAIMED")) return { status: "already_claimed" };
    if (message.includes("TASK_ALREADY_DONE")) return { status: "already_done" };
    throw new Error(`Failed to start task: ${message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as StartTaskRpcRow | undefined;
  if (!row) throw new Error("start_task returned no row");

  return {
    status: "ok",
    task: {
      id: row.id,
      status: row.status,
      assigneeId: row.assignee_id,
      assigneeStartedAt: row.assignee_started_at,
      assigneeForkFullName: row.assignee_fork_full_name,
      assigneeBranch: row.assignee_branch,
    },
  };
}

export interface SubmitTaskResult {
  status: "ok";
  task: {
    id: string;
    status: AdminTaskStatus;
  };
  pullRequest: {
    id: string;
    url: string;
    number: number | null;
  };
}

export type SubmitTaskOutcome =
  | SubmitTaskResult
  | { status: "not_found" }
  | { status: "not_yours" }
  | { status: "already_done" };

interface SubmitTaskRpcRow {
  id: string;
  status: AdminTaskStatus;
  pull_request_id: string;
  github_pr_url: string;
  github_pr_number: number | null;
}

/**
 * Records a `dev submit` — the write path `POST /tasks/:id/submit`
 * (src/routes/tasks.ts) uses after it has already opened (or found the
 * already-open) GitHub pull request via src/lib/githubPullRequest.ts. All
 * of the actual bookkeeping (locking, upserting the task's one open
 * `pull_requests` row, advancing status to `IN_REVIEW`, rejecting a task
 * that isn't the caller's own claim or is already `DONE`) lives in
 * `devtunnel.submit_task()` (sql/031) — this function's only job is
 * turning that function's raised exceptions into a typed outcome the
 * route can map to the right HTTP status, same pattern `startTask` above
 * already uses for `start_task`.
 */
export async function submitTask(
  supabase: SupabaseClient,
  taskId: string,
  userId: string,
  args: { prUrl: string; prNumber: number | null; branch: string; title: string },
): Promise<SubmitTaskOutcome> {
  const { data, error } = await supabase.rpc("submit_task", {
    p_task_id: taskId,
    p_user_id: userId,
    p_pr_url: args.prUrl,
    p_pr_number: args.prNumber,
    p_branch: args.branch,
    p_title: args.title,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("TASK_NOT_FOUND")) return { status: "not_found" };
    if (message.includes("TASK_NOT_YOURS")) return { status: "not_yours" };
    if (message.includes("TASK_ALREADY_DONE")) return { status: "already_done" };
    throw new Error(`Failed to submit task: ${message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as SubmitTaskRpcRow | undefined;
  if (!row) throw new Error("submit_task returned no row");

  return {
    status: "ok",
    task: { id: row.id, status: row.status },
    pullRequest: {
      id: row.pull_request_id,
      url: row.github_pr_url,
      number: row.github_pr_number,
    },
  };
}