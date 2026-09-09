import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminTaskDetail,
  AdminTaskGithubIssueRef,
  AdminTaskListRow,
  AdminTaskStatus,
  AdminTaskSummary,
  AdminTaskUpdatePayload,
  DeleteAdminTaskResult,
  DeveloperRole,
  ExperienceLevel,
  OnboardingTechStack,
} from "../types";

/**
 * Explicit column list — never `select("*")` (Backend_Development_Rules.txt
 * rule 23), even though `devtunnel.admin_task_list` (sql/013) is already a
 * curated, admin-safe view. Naming every column here also means a column
 * added to the view later doesn't silently start flowing into
 * `AdminTaskSummary`/`AdminTaskDetail` without a conscious update to the
 * mapping functions below.
 */
const LIST_COLUMNS =
  "id, slug, title, status, role, difficulty, assignee_id, github_issue_number, " +
  "github_issue_url, github_issue_snapshot, custom_description, deleted_at, created_at, " +
  "project_id, project_slug, project_name, project_repo_url, project_github_full_name, " +
  "project_github_author, project_github_owner, project_tech_stack, submission_count";

/**
 * Flattens a project's already-validated tech stack into the flat tag
 * list `AdminTaskSummary.techStack` renders — same order
 * `TaskPreviewStep` (devtunnel-frontend/src/components/admin/
 * task-onboarding/steps/task-preview-step.tsx) already uses for the
 * onboarding preview: languages, frontend, backend, frameworks,
 * databases, libraries, buildTools (never `packageManager`, which isn't a
 * "tag"). A task never has a tech stack of its own — this is exposing the
 * project's existing curation, never a second, independent source of
 * truth (rule 37/38: never fabricate/duplicate a metric).
 */
function flattenTechStack(techStack: OnboardingTechStack | null): string[] {
  if (!techStack) return [];
  return [
    ...(techStack.languages ?? []),
    ...(techStack.frontend ?? []),
    ...(techStack.backend ?? []),
    ...(techStack.frameworks ?? []),
    ...(techStack.databases ?? []),
    ...(techStack.libraries ?? []),
    ...(techStack.buildTools ?? []),
  ];
}

/**
 * Builds the read-only GitHub issue reference from a task's own
 * `github_issue_snapshot` (sql/010/012) — never a live GitHub call. Only
 * `null` for a task somehow missing its snapshot (defensive only; every
 * task produced by `complete_task_onboarding()` (sql/012) always has one
 * — rule 73: never trust a database result blindly).
 */
function toGithubIssueRef(row: AdminTaskListRow): AdminTaskGithubIssueRef | null {
  const snapshot = row.github_issue_snapshot;
  if (!snapshot || row.github_issue_number === null) return null;

  return {
    number: row.github_issue_number,
    title: snapshot.title,
    url: row.github_issue_url ?? snapshot.url,
    state: snapshot.state,
    author: snapshot.author,
  };
}

/**
 * Honest 0/1 "working" / "completed" contributor counts (admin_workflow.txt
 * section 14 — "People Doing Tasks"). `devtunnel.tasks` (sql/004) only
 * ever records a single `assignee_id` — there is no multi-contributor
 * tracking table in this schema, so reporting anything beyond 0 or 1 here
 * would be exactly the fabricated metric rule 38 ("Never Fake Metrics")
 * forbids. `submissionCount`, by contrast, is a real many-valued count
 * already computed in SQL (`devtunnel.admin_task_list`, sql/013) from
 * actual `devtunnel.pull_requests` rows.
 */
function contributorCounts(row: AdminTaskListRow): {
  activeContributorCount: number;
  completedContributorCount: number;
} {
  const hasAssignee = row.assignee_id !== null;
  return {
    activeContributorCount: hasAssignee && row.status === "IN_PROGRESS" ? 1 : 0,
    completedContributorCount: hasAssignee && row.status === "DONE" ? 1 : 0,
  };
}

/**
 * Maps one row of `devtunnel.admin_task_list` (sql/013) to the
 * frontend-facing `AdminTaskSummary` shape
 * (devtunnel-frontend/src/lib/admin/tasks/types.ts).
 *
 * Falls back to the repository owner as the displayed project author when
 * no `github_author` snapshot was captured at Project Onboarding time
 * (defensive only, same reasoning as `toAdminProjectSummary` in
 * src/db/adminProjects.ts — rule 73).
 */
function toAdminTaskSummary(row: AdminTaskListRow): AdminTaskSummary {
  const { activeContributorCount, completedContributorCount } = contributorCounts(row);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    project: {
      id: row.project_id,
      slug: row.project_slug,
      name: row.project_name,
      repositoryUrl: row.project_repo_url ?? "",
      repositoryFullName: row.project_github_full_name ?? "",
      author: row.project_github_author
        ? {
            username: row.project_github_author.username,
            name: row.project_github_author.name,
            avatarUrl: row.project_github_author.avatarUrl,
          }
        : {
            username: row.project_github_owner ?? "unknown",
            name: null,
            avatarUrl: null,
          },
    },
    githubIssue: toGithubIssueRef(row),
    role: row.role,
    difficulty: row.difficulty,
    techStack: flattenTechStack(row.project_tech_stack),
    status: row.status,
    activeContributorCount,
    completedContributorCount,
    submissionCount: row.submission_count,
    deletedAt: row.deleted_at,
  };
}

/**
 * Maps one row of `devtunnel.admin_task_list` to the frontend-facing
 * `AdminTaskDetail` shape — the summary above plus the task's own curated
 * description fields, both already present on the same view row (unlike
 * `AdminProjectDetail`, which needs a second read against the base
 * table — a task's detail-only fields (`custom_description`,
 * `github_issue_snapshot`'s body) were already selected as part of
 * `LIST_COLUMNS`, so no second query is needed here).
 */
function toAdminTaskDetail(row: AdminTaskListRow): AdminTaskDetail {
  return {
    ...toAdminTaskSummary(row),
    customDescription: row.custom_description,
    githubIssueBody: row.github_issue_snapshot?.body ?? null,
  };
}

export interface ListAdminTasksOptions {
  /** Max rows to return (already validated by the route's Zod schema). */
  limit: number;
  /** Keyset cursor — return rows strictly older than this `created_at`. */
  before: string | null;
}

export interface AdminTasksPage {
  tasks: AdminTaskSummary[];
  /** Pass as `before` on the next request to fetch the following page. `null` when there are no more rows. */
  nextCursor: string | null;
}

/**
 * Keyset-paginated (not offset-based) read of every DevTunnel task,
 * newest first — same pattern as `listAdminProjects`
 * (src/db/adminProjects.ts) and for the same reason (rule 40/41:
 * pagination is mandatory for large collections, and must actually
 * scale as the table grows).
 *
 * Deliberately includes soft-deleted tasks (`deleted_at` surfaced, never
 * filtered here) — admin_workflow.txt section 15 requires Admin to see
 * "Deleted DevTunnel Tasks / Issues" whose GitHub issue still exists, and
 * the already-shipped frontend (`AdminTasksExplorer`) splits the single
 * `GET /admin/tasks` response into "Tasks" / "Deleted in DevTunnel" tabs
 * purely on `task.deletedAt`, client-side.
 *
 * Backs `GET /admin/tasks` (admin_workflow.txt section 8/13).
 */
export async function listAdminTasks(
  supabase: SupabaseClient,
  options: ListAdminTasksOptions,
): Promise<AdminTasksPage> {
  let query = supabase
    .from("admin_task_list")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    // Fetch one extra row so we can tell whether another page exists
    // without a separate COUNT query.
    .limit(options.limit + 1);

  if (options.before) {
    query = query.lt("created_at", options.before);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load admin task list: ${error.message}`);

  const rows = (data ?? []) as unknown as AdminTaskListRow[];
  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;

  return {
    tasks: page.map(toAdminTaskSummary),
    nextCursor: hasMore ? (page[page.length - 1] as AdminTaskListRow).created_at : null,
  };
}

/**
 * Single-task detail lookup backing `GET /admin/tasks/:id` (section 13's
 * "View task" action; A14 in the final page list, section 29). Returns
 * `null` for a task that doesn't exist OR has been soft-deleted — a
 * deleted task's DevTunnel representation is gone, so its detail/edit
 * routes 404 (the same posture `getAdminProjectDetailById` takes for a
 * deleted project) even though the same task still legitimately appears
 * in `GET /admin/tasks`'s "Deleted in DevTunnel" list (rule 17: don't
 * paper over "this resource is gone" as a 200).
 */
export async function getAdminTaskDetailById(
  supabase: SupabaseClient,
  id: string,
): Promise<AdminTaskDetail | null> {
  const { data, error } = await supabase
    .from("admin_task_list")
    .select(LIST_COLUMNS)
    .eq("id", id)
    .maybeSingle<AdminTaskListRow>();

  if (error) throw new Error(`Failed to load task: ${error.message}`);
  if (!data || data.deleted_at) return null;

  return toAdminTaskDetail(data);
}

/**
 * Errors `updateAdminTask` raises for update-specific business rules,
 * kept distinct from a generic thrown `Error` so the route handler
 * (src/routes/admin/tasks.ts) can map each one to the correct HTTP
 * status without string-matching a message — same pattern as
 * `AdminProjectUpdateError` in src/db/adminProjects.ts (rule 20:
 * centralized, predictable error handling).
 */
export class AdminTaskUpdateError extends Error {
  code: "not_found" | "deleted";
  constructor(code: AdminTaskUpdateError["code"], message: string) {
    super(message);
    this.name = "AdminTaskUpdateError";
    this.code = code;
  }
}

/** Row shape read before applying a `PATCH /admin/tasks/:id` update. */
interface UpdateTargetRow {
  id: string;
  deleted_at: string | null;
}

/**
 * Applies a partial update to an already-active DevTunnel task — backs
 * `PATCH /admin/tasks/:id` (admin_workflow.txt section 22).
 *
 * Deliberately restricted to exactly the fields `AdminTaskUpdatePayload`
 * allows (role, difficulty, custom description, status) — the project,
 * GitHub issue, contributor counts, and submission count are
 * derived/GitHub-sourced and have no writable path here, same restriction
 * `updateAdminProject` applies to projects.
 *
 * Reads the current row first (rather than blind-writing) to give a
 * specific 404/409 instead of a silent no-op when the task doesn't exist
 * or has been soft-deleted (sql/013; `deleteAdminTask`) — same reasoning
 * as `updateAdminProject`. The final `.is("deleted_at", null)` guard on
 * the write itself closes the race where the task is soft-deleted by a
 * concurrent request between the read and this update — the write then
 * affects zero rows instead of silently reviving a deleted task's
 * content (rule 74: handle race conditions; rule 101: no fake success
 * responses).
 */
export async function updateAdminTask(
  supabase: SupabaseClient,
  taskId: string,
  input: AdminTaskUpdatePayload,
): Promise<AdminTaskDetail> {
  const { data: current, error: fetchError } = await supabase
    .from("tasks")
    .select("id, deleted_at")
    .eq("id", taskId)
    .maybeSingle<UpdateTargetRow>();

  if (fetchError) throw new Error(`Failed to load task for update: ${fetchError.message}`);
  if (!current) throw new AdminTaskUpdateError("not_found", "Task not found");
  if (current.deleted_at) {
    throw new AdminTaskUpdateError(
      "deleted",
      "This task has been deleted and can no longer be edited",
    );
  }

  const values: {
    role?: DeveloperRole;
    difficulty?: ExperienceLevel;
    custom_description?: string | null;
    status?: AdminTaskStatus;
  } = {};

  if (input.role !== undefined) values.role = input.role;
  if (input.difficulty !== undefined) values.difficulty = input.difficulty;
  if (input.customDescription !== undefined) values.custom_description = input.customDescription;
  if (input.status !== undefined) values.status = input.status;

  const { error: updateError } = await supabase
    .from("tasks")
    .update(values)
    .eq("id", taskId)
    .is("deleted_at", null);

  if (updateError) throw new Error(`Failed to update task: ${updateError.message}`);

  const detail = await getAdminTaskDetailById(supabase, taskId);
  if (!detail) {
    // Raced with a concurrent soft-delete between the write above and
    // this read — report it the same as any other not-found rather than
    // fabricating a response for a task that no longer resolves.
    throw new AdminTaskUpdateError("not_found", "Task not found");
  }
  return detail;
}

/**
 * Errors `deleteAdminTask` raises for delete-specific business rules,
 * kept distinct from a generic thrown `Error` so the route handler can
 * map each one to the correct HTTP status without string-matching a
 * message — same pattern as `AdminProjectDeleteError`
 * (src/db/adminProjects.ts).
 */
export class AdminTaskDeleteError extends Error {
  code: "not_found" | "already_deleted";
  constructor(code: AdminTaskDeleteError["code"], message: string) {
    super(message);
    this.name = "AdminTaskDeleteError";
    this.code = code;
  }
}

/**
 * Soft-deletes a task — backs `DELETE /admin/tasks/:id` (admin_workflow.txt
 * section 15 — "Deleted DevTunnel Tasks / Issues": "The GitHub issue is
 * not deleted just because the DevTunnel representation is deleted").
 *
 * Delegates to the atomic `delete_admin_task` Postgres function
 * (sql/013) so the existence check, already-deleted check, and the
 * `deleted_at`/`deleted_by`/`delete_reason` update happen in one
 * transaction with the task row locked for the duration — same rationale
 * as `deleteAdminProject` (rule 26/55/74: read-then-write business logic
 * belongs in the database transaction, not split across a read and a
 * write from the application).
 *
 * Never issues a physical `DELETE` — the task's `github_issue_number` /
 * `github_issue_url` / `github_issue_snapshot` columns are left
 * untouched, which is exactly what lets the "Deleted in DevTunnel" view
 * keep showing the original issue after this runs.
 */
export async function deleteAdminTask(
  supabase: SupabaseClient,
  adminId: string,
  taskId: string,
  reason: string | null,
): Promise<DeleteAdminTaskResult> {
  const { data, error } = await supabase.rpc("delete_admin_task", {
    p_task_id: taskId,
    p_admin_id: adminId,
    p_reason: reason,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("TASK_NOT_FOUND")) {
      throw new AdminTaskDeleteError("not_found", "Task not found");
    }
    if (message.includes("TASK_ALREADY_DELETED")) {
      throw new AdminTaskDeleteError("already_deleted", "This task has already been deleted");
    }
    throw new Error(`Failed to delete task: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("delete_admin_task returned no row");
  }
  return { id: row.id, slug: row.slug, title: row.title, deletedAt: row.deleted_at };
}