import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminProjectDetail,
  AdminProjectDetailExtraRow,
  AdminProjectGithubRepoRef,
  AdminProjectListRow,
  AdminProjectSummary,
  AdminProjectUpdatePayload,
  DeleteAdminProjectResult,
  OnboardingTechStack,
} from "../types";

/**
 * Explicit column list for the detail-only fields — selected from
 * `devtunnel.projects` directly (the base table, NOT the
 * `admin_project_list` view `LIST_COLUMNS` below reads from). These
 * columns were never added to that view's exposed columns because the
 * list row (`AdminProjectSummary`) never needed them — only the single-
 * project detail page (and its edit panel) does (rule 23: never
 * `select("*")`, select exactly what the caller needs).
 */
const DETAIL_EXTRA_COLUMNS =
  "github_description, readme, open_issues, description_source, custom_description, tech_stack";

/**
 * Normalizes a `devtunnel.projects.tech_stack` jsonb value into the
 * frontend-facing `OnboardingTechStack` shape, or `null` when nothing
 * meaningful has actually been recorded.
 *
 * Two defensive reasons this exists rather than casting the column
 * straight through (rule 73: never trust a database result blindly):
 *
 *  1. The column's schema default is `'{}'::jsonb` NOT NULL (sql/006), so
 *     a project that never went through Step 3 (or had every tech-stack
 *     field cleared via `PATCH /admin/projects/:id`) has a real, non-null
 *     `{}` row value that is missing every array key `OnboardingTechStack`
 *     requires — passing that straight to the frontend as `techStack`
 *     would make `project.techStack ?? EMPTY_TECH_STACK` in
 *     `EditProjectDetailsPanel` pick the truthy-but-empty `{}` over the
 *     fallback, then crash the first time a field is indexed
 *     (`techStack.languages.length`, etc.).
 *  2. Any array key genuinely missing from the stored jsonb (e.g. an
 *     older row saved before a field existed) is filled with `[]` rather
 *     than left `undefined`, so the shape returned to the frontend always
 *     matches `OnboardingTechStack` exactly.
 */
function toOnboardingTechStackOrNull(raw: unknown): OnboardingTechStack | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<OnboardingTechStack>;

  const languages = Array.isArray(value.languages) ? value.languages : [];
  const frontend = Array.isArray(value.frontend) ? value.frontend : [];
  const backend = Array.isArray(value.backend) ? value.backend : [];
  const frameworks = Array.isArray(value.frameworks) ? value.frameworks : [];
  const databases = Array.isArray(value.databases) ? value.databases : [];
  const libraries = Array.isArray(value.libraries) ? value.libraries : [];
  const buildTools = Array.isArray(value.buildTools) ? value.buildTools : [];
  const packageManager = typeof value.packageManager === "string" ? value.packageManager : null;

  const hasContent =
    languages.length > 0 ||
    frontend.length > 0 ||
    backend.length > 0 ||
    frameworks.length > 0 ||
    databases.length > 0 ||
    libraries.length > 0 ||
    buildTools.length > 0 ||
    Boolean(packageManager);

  if (!hasContent) return null;

  return { languages, frontend, backend, frameworks, databases, libraries, buildTools, packageManager };
}

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
    description:
      data.description_source !== null
        ? { choice: data.description_source, customDescription: data.custom_description }
        : null,
    techStack: toOnboardingTechStackOrNull(data.tech_stack),
  };
}

/** Row shape for `getProjectGithubRepoRef` below — never `select("*")` (rule 23). */
interface GithubRepoRefRow {
  github_owner: string | null;
  github_full_name: string | null;
  deleted_at: string | null;
}

/**
 * Resolves the GitHub `{ owner, repo }` coordinates for an already-active
 * DevTunnel project, straight from what Project Onboarding Step 1
 * captured (`devtunnel.projects.github_owner` / `github_full_name`,
 * sql/006) — never re-parsed from a client-supplied URL (rule 15: this is
 * exactly the kind of value the backend already owns and must not accept
 * as request input).
 *
 * Backs `GET /admin/projects/:id/github/issues` (admin_workflow.txt
 * section 10 ▸ Step 2) and Task Onboarding's issue-selection routes
 * (src/routes/taskOnboarding.ts), both of which need these coordinates to
 * call src/lib/githubRepo.ts. Returns `null` for a project that doesn't
 * exist, has been soft-deleted, or is missing a `github_full_name`
 * snapshot (defensive only — every project created through
 * `complete_project_onboarding` (sql/006) always has one) — the caller
 * maps any of these to the same 404, indistinguishable to the admin
 * (rule 13: prevent IDOR by never revealing *why* a resource isn't
 * usable).
 */
export async function getProjectGithubRepoRef(
  supabase: SupabaseClient,
  projectId: string,
): Promise<AdminProjectGithubRepoRef | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("github_owner, github_full_name, deleted_at")
    .eq("id", projectId)
    .maybeSingle<GithubRepoRefRow>();

  if (error) throw new Error(`Failed to load project GitHub reference: ${error.message}`);
  if (!data || data.deleted_at || !data.github_full_name) return null;

  const repo = data.github_full_name.split("/")[1];
  const owner = data.github_owner ?? data.github_full_name.split("/")[0];
  if (!owner || !repo) return null;

  return { owner, repo };
}

/**
 * Errors `updateAdminProject` raises for update-specific business rules,
 * kept distinct from a generic thrown `Error` so the route handler
 * (src/routes/admin/projects.ts) can map each one to the correct HTTP
 * status without string-matching a message — same pattern as
 * `AdminProjectDeleteError` above and `ProjectOnboardingError` in
 * src/db/projectOnboarding.ts (rule 20: centralized, predictable error
 * handling).
 */
export class AdminProjectUpdateError extends Error {
  code: "not_found" | "deleted";
  constructor(code: AdminProjectUpdateError["code"], message: string) {
    super(message);
    this.name = "AdminProjectUpdateError";
    this.code = code;
  }
}

/** Row shape read before applying a `PATCH /admin/projects/:id` update. */
interface UpdateTargetRow {
  id: string;
  deleted_at: string | null;
  description_source: AdminProjectDetailExtraRow["description_source"];
  custom_description: string | null;
  github_description: string | null;
}

/**
 * Applies a partial update to an already-active DevTunnel project —
 * backs `PATCH /admin/projects/:id` (admin_workflow.txt section 22).
 *
 * Deliberately restricted to exactly the two fields Project Onboarding's
 * Step 2 (Description) and Step 3 (Tech Stack) already hand the Admin
 * control over (`AdminProjectUpdatePayload`) — the repository, author,
 * GitHub contributors, name, and every other GitHub-sourced field stay
 * exactly what GitHub reported and have no writable path here, same
 * restriction the onboarding wizard itself enforces on those fields
 * ("Admin should not manually enter Author, GitHub username, repository
 * name, contributors, language, stars, forks, issues — these should come
 * from GitHub").
 *
 * Reads the current row first (rather than blind-writing) for two
 * reasons: (1) to give a specific 404/409 instead of a silent no-op when
 * the project doesn't exist or has been soft-deleted (sql/008;
 * `deleteAdminProject`), and (2) because a *partial* update needs the
 * existing `github_description` to correctly recompute the computed
 * `description` column when only `techStack` is being changed (or vice
 * versa) — the same `description_source = 'CUSTOM' ? custom_description
 * : github_description` rule `complete_project_onboarding()` (sql/006)
 * applies at creation time is re-applied here so the two never drift
 * apart after an edit.
 *
 * The final `.is("deleted_at", null)` guard on the write itself closes
 * the (narrow) race where the project is soft-deleted by a concurrent
 * request between the read above and this update — the write then
 * affects zero rows instead of silently reviving a deleted project's
 * content, and the caller gets a clean `not_found` from the follow-up
 * `getAdminProjectDetailById` read below rather than a false success
 * (rule 74: handle race conditions; rule 101: no fake success responses).
 */
export async function updateAdminProject(
  supabase: SupabaseClient,
  projectId: string,
  input: AdminProjectUpdatePayload,
): Promise<AdminProjectDetail> {
  const { data: current, error: fetchError } = await supabase
    .from("projects")
    .select("id, deleted_at, description_source, custom_description, github_description")
    .eq("id", projectId)
    .maybeSingle<UpdateTargetRow>();

  if (fetchError) throw new Error(`Failed to load project for update: ${fetchError.message}`);
  if (!current) throw new AdminProjectUpdateError("not_found", "Project not found");
  if (current.deleted_at) {
    throw new AdminProjectUpdateError(
      "deleted",
      "This project has been deleted and can no longer be edited",
    );
  }

  const values: Record<string, unknown> = {};

  if (input.description) {
    const nextChoice = input.description.choice;
    const nextCustomDescription = nextChoice === "CUSTOM" ? input.description.customDescription ?? null : null;
    values.description_source = nextChoice;
    values.custom_description = nextCustomDescription;
    // Keep the public `description` column (used elsewhere for the
    // public project page) in lockstep with the same rule
    // `complete_project_onboarding()` applies at creation time.
    values.description = nextChoice === "CUSTOM" ? nextCustomDescription : current.github_description;
  }

  if (input.techStack) {
    values.tech_stack = input.techStack;
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update(values)
    .eq("id", projectId)
    .is("deleted_at", null);

  if (updateError) throw new Error(`Failed to update project: ${updateError.message}`);

  const detail = await getAdminProjectDetailById(supabase, projectId);
  if (!detail) {
    // Raced with a concurrent soft-delete between the write above and
    // this read — report it the same as any other not-found rather than
    // fabricating a response for a project that no longer resolves.
    throw new AdminProjectUpdateError("not_found", "Project not found");
  }
  return detail;
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