import type { AdminTaskStatus } from "../types"; // add to the existing top-of-file import if not already there

/* ---------------------------------------------------------------------------
 * `dev start --project` / `dev submit --project` — project-level claim
 * tracking. Mirrors the task-level equivalents in src/db/tasks.ts
 * (getTaskById / startTask / submitTask) column-for-column, reading and
 * writing devtunnel.projects.claim_status / assignee_* (sql/032, sql/033)
 * instead of devtunnel.tasks.status / assignee_*.
 *
 * Reuses AdminTaskStatus for claim_status's TS type rather than inventing
 * a near-duplicate — the underlying Postgres enum (devtunnel.task_status)
 * is the same one, reused deliberately (see sql/032's header note).
 * ------------------------------------------------------------------------ */

/** Raw row shape for a project's claim state — what `POST /projects/:id/start` and `POST /projects/:id/submit` need to resolve a project id into its GitHub repo and current claim, before either route has (or needs) anything else about the project. */
export interface ProjectClaimRow {
  id: string;
  name: string;
  github_owner: string | null;
  github_full_name: string | null;
  claim_status: AdminTaskStatus;
  assignee_id: string | null;
  assignee_started_at: string | null;
  assignee_fork_full_name: string | null;
  assignee_branch: string | null;
}

const CLAIM_COLUMNS =
  "id, name, github_owner, github_full_name, claim_status, assignee_id, " +
  "assignee_started_at, assignee_fork_full_name, assignee_branch";

/**
 * Single-project lookup by id, for the claim routes. Reads off
 * `devtunnel.admin_project_list` (sql/015, extended by sql/032) rather
 * than the base table — that view already excludes soft-deleted projects
 * (`where p.deleted_at is null`, sql/015), so unlike `getTaskById`
 * (which has to check `deleted_at` itself, since `admin_task_list`
 * doesn't filter it) there's no separate deleted check needed here: a
 * soft-deleted project simply isn't returned.
 *
 * Deliberately does NOT filter on `status = 'ACTIVE'` the way
 * `getProjectDetailBySlug` does — an archived project can still be
 * mid-claim (someone started it before it was archived), and `dev
 * submit --project` on that claim should still work. Only
 * `claim_status`/`assignee_*` gate the claim workflow; publish `status`
 * is an orthogonal concern here.
 */
export async function getProjectById(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ProjectClaimRow | null> {
  const { data, error } = await supabase
    .from("admin_project_list")
    .select(CLAIM_COLUMNS)
    .eq("id", projectId)
    .maybeSingle<ProjectClaimRow>();

  if (error) throw new Error(`Failed to load project: ${error.message}`);
  return data ?? null;
}

export interface StartProjectResult {
  status: "ok";
  project: {
    id: string;
    claimStatus: AdminTaskStatus;
    assigneeId: string;
    assigneeStartedAt: string;
    assigneeForkFullName: string;
    assigneeBranch: string;
  };
}

export type StartProjectOutcome =
  | StartProjectResult
  | { status: "not_found" }
  | { status: "already_claimed" }
  | { status: "already_done" };

interface StartProjectRpcRow {
  id: string;
  claim_status: AdminTaskStatus;
  assignee_id: string;
  assignee_started_at: string;
  assignee_fork_full_name: string;
  assignee_branch: string;
}

/**
 * Claims `projectId` for `userId` — the write path `dev start --project`
 * (`POST /projects/:id/start`) uses after it has already created/found
 * the contributor's fork and decided on a branch name. Mirrors
 * `startTask` (db/tasks.ts) exactly, calling `devtunnel.start_project()`
 * (sql/032) instead of `start_task()` and mapping `PROJECT_*` exceptions
 * instead of `TASK_*`.
 */
export async function startProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  forkFullName: string,
  branch: string,
): Promise<StartProjectOutcome> {
  const { data, error } = await supabase.rpc("start_project", {
    p_project_id: projectId,
    p_user_id: userId,
    p_fork_full_name: forkFullName,
    p_branch: branch,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("PROJECT_NOT_FOUND")) return { status: "not_found" };
    if (message.includes("PROJECT_ALREADY_CLAIMED")) return { status: "already_claimed" };
    if (message.includes("PROJECT_ALREADY_DONE")) return { status: "already_done" };
    throw new Error(`Failed to start project: ${message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as StartProjectRpcRow | undefined;
  if (!row) throw new Error("start_project returned no row");

  return {
    status: "ok",
    project: {
      id: row.id,
      claimStatus: row.claim_status,
      assigneeId: row.assignee_id,
      assigneeStartedAt: row.assignee_started_at,
      assigneeForkFullName: row.assignee_fork_full_name,
      assigneeBranch: row.assignee_branch,
    },
  };
}

export interface SubmitProjectResult {
  status: "ok";
  project: {
    id: string;
    claimStatus: AdminTaskStatus;
  };
  pullRequest: {
    id: string;
    url: string;
    number: number | null;
  };
}

export type SubmitProjectOutcome =
  | SubmitProjectResult
  | { status: "not_found" }
  | { status: "not_yours" }
  | { status: "already_done" };

interface SubmitProjectRpcRow {
  id: string;
  claim_status: AdminTaskStatus;
  pull_request_id: string;
  github_pr_url: string;
  github_pr_number: number | null;
}

/**
 * Records a `dev submit --project` — the write path
 * `POST /projects/:id/submit` uses after it has already opened (or found
 * the already-open) GitHub pull request. Mirrors `submitTask`
 * (db/tasks.ts) exactly, calling `devtunnel.submit_project()` (sql/033).
 */
export async function submitProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  args: { prUrl: string; prNumber: number | null; branch: string; title: string },
): Promise<SubmitProjectOutcome> {
  const { data, error } = await supabase.rpc("submit_project", {
    p_project_id: projectId,
    p_user_id: userId,
    p_pr_url: args.prUrl,
    p_pr_number: args.prNumber,
    p_branch: args.branch,
    p_title: args.title,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("PROJECT_NOT_FOUND")) return { status: "not_found" };
    if (message.includes("PROJECT_NOT_YOURS")) return { status: "not_yours" };
    if (message.includes("PROJECT_ALREADY_DONE")) return { status: "already_done" };
    throw new Error(`Failed to submit project: ${message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as SubmitProjectRpcRow | undefined;
  if (!row) throw new Error("submit_project returned no row");

  return {
    status: "ok",
    project: { id: row.id, claimStatus: row.claim_status },
    pullRequest: {
      id: row.pull_request_id,
      url: row.github_pr_url,
      number: row.github_pr_number,
    },
  };
}