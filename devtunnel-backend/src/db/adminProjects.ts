import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminProjectListRow, AdminProjectSummary } from "../types";

/**
 * Explicit column list — never `select("*")` (Backend_Development_Rules.txt
 * rule 23), even though `devtunnel.admin_project_list` (sql/007) is already
 * a curated, admin-safe view. Naming every column here also means a column
 * added to the view later doesn't silently start flowing into
 * `AdminProjectSummary` without a conscious update to `toAdminProjectSummary`
 * below.
 */
const LIST_COLUMNS =
  "id, slug, name, repo_url, github_full_name, github_owner, github_author, " +
  "status, created_at, github_contributor_count, task_count, devtunnel_contributor_count";

/**
 * Maps one row of the `devtunnel.admin_project_list` view (sql/007) to the
 * frontend-facing `AdminProjectSummary` shape
 * (devtunnel-frontend/src/lib/admin/projects/types.ts).
 *
 * Falls back to the repository owner as the displayed author when no
 * `github_author` snapshot was captured at onboarding time (defensive only
 * — every project created through `complete_project_onboarding` (sql/006)
 * always has one; this just avoids a crash if a row is ever missing it,
 * rather than trusting the database blindly — rule 73).
 */
function toAdminProjectSummary(row: AdminProjectListRow): AdminProjectSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    repositoryUrl: row.repo_url ?? "",
    repositoryFullName: row.github_full_name ?? "",
    author: row.github_author
      ? {
          username: row.github_author.username,
          name: row.github_author.name,
          avatarUrl: row.github_author.avatarUrl,
        }
      : {
          username: row.github_owner ?? "unknown",
          name: null,
          avatarUrl: null,
        },
    devTunnelContributorCount: row.devtunnel_contributor_count,
    githubContributorCount: row.github_contributor_count,
    taskCount: row.task_count,
    status: row.status,
  };
}

export interface ListAdminProjectsOptions {
  /** Max rows to return (already validated by the route's Zod schema). */
  limit: number;
  /** Keyset cursor — return rows strictly older than this `created_at`. */
  before: string | null;
}

export interface AdminProjectsPage {
  projects: AdminProjectSummary[];
  /** Pass as `before` on the next request to fetch the following page. `null` when there are no more rows. */
  nextCursor: string | null;
}

/**
 * Keyset-paginated (not offset-based) read of every DevTunnel project,
 * newest first — same pattern as `listAdminAuditLog`
 * (src/db/adminAudit.ts) and for the same reason: this table only grows,
 * and an offset-based `LIMIT/OFFSET` gets slower and can skip/duplicate
 * rows as new projects are onboarded between page loads
 * (Backend_Development_Rules.txt rule 21: pagination for large
 * collections must actually scale).
 *
 * Backs `GET /admin/projects` (admin_workflow.txt section 4 — "Show all
 * projects currently available on DevTunnel").
 */
export async function listAdminProjects(
  supabase: SupabaseClient,
  options: ListAdminProjectsOptions,
): Promise<AdminProjectsPage> {
  let query = supabase
    .from("admin_project_list")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    // Fetch one extra row so we can tell whether another page exists
    // without a separate COUNT query.
    .limit(options.limit + 1);

  if (options.before) {
    query = query.lt("created_at", options.before);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load admin project list: ${error.message}`);

  const rows = (data ?? []) as AdminProjectListRow[];
  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;

  return {
    projects: page.map(toAdminProjectSummary),
    nextCursor: hasMore ? (page[page.length - 1] as AdminProjectListRow).created_at : null,
  };
}

/**
 * Single-project lookup backing `GET /admin/projects/:id` (the table's
 * "View" action, section 4). Returns `null` when no project with that id
 * exists — the route maps that to a 404, never a 500 (rule 17).
 */
export async function getAdminProjectById(
  supabase: SupabaseClient,
  id: string,
): Promise<AdminProjectSummary | null> {
  const { data, error } = await supabase
    .from("admin_project_list")
    .select(LIST_COLUMNS)
    .eq("id", id)
    .maybeSingle<AdminProjectListRow>();

  if (error) throw new Error(`Failed to load project: ${error.message}`);
  return data ? toAdminProjectSummary(data) : null;
}