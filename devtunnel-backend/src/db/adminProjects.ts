import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminProjectDetail,
  AdminProjectDetailExtraRow,
  AdminProjectListRow,
  AdminProjectSummary,
  DeleteAdminProjectResult,
} from "../types";

/**
 * Explicit column list for the detail-only fields — selected from
 * `devtunnel.projects` directly (the base table, NOT the
 * `admin_project_list` view `LIST_COLUMNS` below reads from). These three
 * columns were never added to that view's exposed columns because the
 * list row (`AdminProjectSummary`) never needed them — only the single-
 * project detail page does (rule 23: never `select("*")`, select exactly
 * what the caller needs).
 */
const DETAIL_EXTRA_COLUMNS = "github_description, readme, open_issues";

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

/**
 * Full single-project detail backing `GET /admin/projects/:id` (section
 * 18 — "Project Detail Page") and the frontend's `AdminProjectDetail`
 * contract (devtunnel-frontend/src/lib/admin/projects/types.ts) — the
 * shape its `page.tsx` actually renders: description, README, and open
 * GitHub issue count, none of which `getAdminProjectById`'s
 * `AdminProjectSummary` carries.
 *
 * Two reads, not one: the list/summary fields still come from the
 * `admin_project_list` view (same aggregate counts as the Projects table
 * — `getAdminProjectById` above, kept as the single place that maps that
 * view's row shape), and the three detail-only fields come from
 * `devtunnel.projects` directly via `DETAIL_EXTRA_COLUMNS`. This mirrors
 * `db/devtunnelStats.ts` already querying `.from("projects")` directly
 * against the same schema-scoped client (src/lib/supabase.ts) — not a new
 * pattern in this codebase. Returns `null` when no project with that id
 * exists, same as `getAdminProjectById` — the route maps that to a 404,
 * never a 500 (rule 17).
 */
export async function getAdminProjectDetailById(
  supabase: SupabaseClient,
  id: string,
): Promise<AdminProjectDetail | null> {
  const summary = await getAdminProjectById(supabase, id);
  if (!summary) return null;

  const { data, error } = await supabase
    .from("projects")
    .select(DETAIL_EXTRA_COLUMNS)
    .eq("id", id)
    .maybeSingle<AdminProjectDetailExtraRow>();

  if (error) throw new Error(`Failed to load project detail: ${error.message}`);
  if (!data) {
    // The view row above exists but the base table row is gone — a race
    // with a concurrent delete between the two reads. Treat it the same
    // as "not found" rather than returning a half-populated object.
    return null;
  }

  return {
    ...summary,
    githubDescription: data.github_description,
    readme: data.readme,
    openIssuesCount: data.open_issues,
  };
}

/**
 * Errors `deleteAdminProject` raises for delete-specific business rules,
 * kept distinct from a generic thrown `Error` so the route handler
 * (src/routes/admin/projects.ts) can map each one to the correct HTTP
 * status without string-matching a message — same pattern as
 * `ProjectOnboardingError` in src/db/projectOnboarding.ts (rule 20:
 * centralized, predictable error handling).
 */
export class AdminProjectDeleteError extends Error {
  code: "not_found" | "already_deleted";
  constructor(code: AdminProjectDeleteError["code"], message: string) {
    super(message);
    this.name = "AdminProjectDeleteError";
    this.code = code;
  }
}

/**
 * Soft-deletes a project — backs `DELETE /admin/projects/:id`.
 *
 * Delegates to the atomic `delete_admin_project` Postgres function
 * (sql/008) so the existence check, already-deleted check, and the
 * `deleted_at`/`deleted_by`/`delete_reason` update happen in one
 * transaction with the project row locked for the duration (same
 * rationale as `completeOnboarding` in src/db/projectOnboarding.ts —
 * rule 26/55/74: read-then-write business logic belongs in the database
 * transaction, not split across a read and a write from the application).
 *
 * Never issues a physical `DELETE` — `devtunnel.tasks` and
 * `devtunnel.pull_requests` reference this project with `on delete
 * cascade` (sql/004), so a hard delete would destroy their history along
 * with the project row (rule 85/86 — see sql/008's header comment).
 */
export async function deleteAdminProject(
  supabase: SupabaseClient,
  adminId: string,
  projectId: string,
  reason: string | null,
): Promise<DeleteAdminProjectResult> {
  const { data, error } = await supabase.rpc("delete_admin_project", {
    p_project_id: projectId,
    p_admin_id: adminId,
    p_reason: reason,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("PROJECT_NOT_FOUND")) {
      throw new AdminProjectDeleteError("not_found", "Project not found");
    }
    if (message.includes("PROJECT_ALREADY_DELETED")) {
      throw new AdminProjectDeleteError("already_deleted", "This project has already been deleted");
    }
    throw new Error(`Failed to delete project: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("delete_admin_project returned no row");
  }
  return { id: row.id, slug: row.slug, name: row.name, deletedAt: row.deleted_at };
}