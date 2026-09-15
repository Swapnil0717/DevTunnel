import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminTaskGithubIssueRef,
  AdminTaskListRow,
  AdminTaskStatus,
  DeveloperRole,
  ExperienceLevel,
} from "../types";
import { LIST_COLUMNS, contributorCounts, flattenTechStack, toGithubIssueRef } from "./adminTasks";

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
   * contributor's `technologies`. Backs `GET /tasks?recommended=true`.
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
 * memory-only filters (`techStack`, `q`, `matchProfile`) are requested —
 * this takes the fast path: real SQL-side keyset pagination, identical in
 * shape to `listAdminTasks` (src/db/adminTasks.ts). The moment a
 * memory-only filter is present, this falls back to the bounded scan +
 * in-memory filter/paginate path described on `IN_MEMORY_SCAN_LIMIT`
 * above — same trade-off `GET /issues` already makes for its own list.
 */
export async function listTasks(
  supabase: SupabaseClient,
  options: ListTasksOptions,
): Promise<TasksPage> {
  const needsInMemoryFiltering =
    options.techStack !== undefined || options.q !== undefined || options.matchProfile !== undefined;

  let query = supabase
    .from("admin_task_list")
    .select(LIST_COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (options.status) query = query.eq("status", options.status);
  if (options.difficulty) query = query.eq("difficulty", options.difficulty);
  if (options.projectSlug) query = query.eq("project_slug", options.projectSlug);
  if (options.role) query = query.overlaps("roles", [options.role]);

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

    rows = rows.filter((row) => {
      const roleMatch = (row.roles ?? []).some((role) => developerRoles.includes(role));
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