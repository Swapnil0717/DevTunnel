import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminTaskStatus } from "../types";

/**
 * Contributor — View Issue (`/issues/:projectSlug/:issueNumber`,
 * devtunnel-frontend's `lib/issues/detail-api.ts`). Backs the one
 * DevTunnel-side fact `GET /issues/:projectSlug/:issueNumber`
 * (src/routes/issueDetail.ts) can't get from GitHub: *is there already a
 * DevTunnel task for this issue?*
 *
 * Reads the same `devtunnel.admin_task_list` view every other
 * contributor-facing task read uses (src/db/tasks.ts) — `id`, `title`,
 * `status`, `project_id`, `github_issue_number` and `deleted_at` are all in
 * its `LIST_COLUMNS` (src/db/adminTasks.ts) — rather than a second query
 * against the base table with columns this file would have to guess.
 *
 * Mirrors `getCoveredIssueNumbersByProject` (src/db/adminNewIssues.ts): a
 * soft-deleted task no longer "covers" the issue, so it's ignored here too.
 * That keeps this page consistent with `/issues`, which only lists an issue
 * once nothing live covers it.
 */
export interface IssueTaskRef {
  id: string;
  title: string;
  status: AdminTaskStatus;
}

interface IssueTaskRow {
  id: string;
  title: string;
  status: AdminTaskStatus;
}

/**
 * The live DevTunnel task created from `issueNumber` on `projectId`, or
 * `null` when there isn't one. If more than one live task somehow points at
 * the same issue, the newest wins — a single bounded row, never a list.
 */
export async function getTaskRefForIssue(
  supabase: SupabaseClient,
  projectId: string,
  issueNumber: number,
): Promise<IssueTaskRef | null> {
  const { data, error } = await supabase
    .from("admin_task_list")
    .select("id, title, status")
    .eq("project_id", projectId)
    .eq("github_issue_number", issueNumber)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw new Error(`Failed to load the task for this issue: ${error.message}`);

  const row = ((data ?? []) as unknown as IssueTaskRow[])[0];
  return row ? { id: row.id, title: row.title, status: row.status } : null;
}
