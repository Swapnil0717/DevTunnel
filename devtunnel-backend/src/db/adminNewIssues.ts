// devtunnel-backend/src/db/adminNewIssues.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminNewIssueProjectRef, OnboardingTechStack } from "../types";

/**
 * Supabase queries backing `GET /admin/new-issues` and
 * `POST /admin/new-issues/:id/ignore` (admin_workflow.txt section 9 —
 * "DevTunnel Task Lifecycle"; section 16 — "New Issues Section"; sql/014).
 * Follows src/db/adminProjects.ts's style: typed row shapes, no raw SQL
 * string building beyond what Supabase's query builder needs, never
 * `select("*")` (Backend_Development_Rules.txt rule 23).
 */

/**
 * Flattens a project's already-validated tech stack into the flat tag
 * list `AdminNewIssueProjectRef.techStack` renders — same order and
 * reasoning as `flattenTechStack` in src/db/adminTasks.ts (a GitHub
 * issue, like a task, has no tech stack of its own; this exposes the
 * project's existing curation, never a second source of truth).
 */
function flattenTechStack(techStack: unknown): string[] {
  if (!techStack || typeof techStack !== "object") return [];
  const stack = techStack as Partial<OnboardingTechStack>;
  return [
    ...(Array.isArray(stack.languages) ? stack.languages : []),
    ...(Array.isArray(stack.frontend) ? stack.frontend : []),
    ...(Array.isArray(stack.backend) ? stack.backend : []),
    ...(Array.isArray(stack.frameworks) ? stack.frameworks : []),
    ...(Array.isArray(stack.databases) ? stack.databases : []),
    ...(Array.isArray(stack.libraries) ? stack.libraries : []),
    ...(Array.isArray(stack.buildTools) ? stack.buildTools : []),
  ];
}

/** A project's resolved GitHub coordinates plus everything `AdminNewIssueProjectRef` needs. */
export interface ActiveProjectWithRepo {
  project: AdminNewIssueProjectRef;
  owner: string;
  repo: string;
}

/** Row shape for `listActiveProjectsWithRepo` — never `select("*")` (rule 23). */
interface ActiveProjectRepoRow {
  id: string;
  slug: string;
  name: string;
  repo_url: string | null;
  github_owner: string | null;
  github_full_name: string | null;
  tech_stack: unknown;
  created_at: string;
}

/**
 * Every active (not soft-deleted) DevTunnel project that has a real
 * GitHub repository to scan — the "For each active project" loop root of
 * section 9's detection algorithm. Reads straight from the base
 * `devtunnel.projects` table (not the `admin_project_list` view used by
 * `listAdminProjects`) because this needs `github_owner` /
 * `github_full_name` to actually call the GitHub API, which that view's
 * `LIST_COLUMNS` in src/db/adminProjects.ts doesn't select — same
 * resolution `getProjectGithubRepoRef` already does for a single project,
 * just batched across every active one here. Also selects `created_at`,
 * mapped straight through as `AdminNewIssueProjectRef.onboardedAt`.
 *
 * A project with no `github_full_name` snapshot (defensive only — every
 * project created through `complete_project_onboarding`, sql/006, always
 * has one) is silently skipped rather than surfaced as an error: it has
 * no repository to fetch issues from, so it simply contributes nothing to
 * the New Issues list (same "nothing to attach" posture
 * `getProjectTechStack` already documents).
 */
export async function listActiveProjectsWithRepo(
  supabase: SupabaseClient,
): Promise<ActiveProjectWithRepo[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, slug, name, repo_url, github_owner, github_full_name, tech_stack, created_at")
    .is("deleted_at", null)
    .not("github_full_name", "is", null);

  if (error) throw new Error(`Failed to load active projects: ${error.message}`);

  const rows = (data ?? []) as ActiveProjectRepoRow[];
  const results: ActiveProjectWithRepo[] = [];

  for (const row of rows) {
    if (!row.github_full_name) continue;
    const repo = row.github_full_name.split("/")[1];
    const owner = row.github_owner ?? row.github_full_name.split("/")[0];
    if (!owner || !repo) continue;

    results.push({
      owner,
      repo,
      project: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        repositoryUrl: row.repo_url ?? "",
        repositoryFullName: row.github_full_name,
        techStack: flattenTechStack(row.tech_stack),
        onboardedAt: row.created_at,
      },
    });
  }

  return results;
}

/** Row shape for `getCoveredIssueNumbersByProject` below. */
interface TaskIssueNumberRow {
  project_id: string;
  github_issue_number: number | null;
}

/**
 * "Fetch DevTunnel-covered issues" (section 16's detection algorithm),
 * batched across every project being scanned in one query rather than
 * one round trip per project. Maps to `project_id -> Set<issue number>`.
 *
 * Only non-deleted tasks count as "covering" an issue: a soft-deleted
 * task (`deleted_at` set, sql/013) is exactly section 15's "the
 * DevTunnel representation is deleted" state — the issue's DevTunnel
 * coverage genuinely ended, even though the GitHub issue itself is
 * untouched, so it's correct for that issue to reappear here as a New
 * Issue an admin can act on again. This is a documented interpretation
 * of section 9's algorithm (which doesn't mention soft-deleted tasks
 * either way) rather than something the spec states outright.
 */
export async function getCoveredIssueNumbersByProject(
  supabase: SupabaseClient,
  projectIds: string[],
): Promise<Map<string, Set<number>>> {
  const covered = new Map<string, Set<number>>();
  if (projectIds.length === 0) return covered;

  const { data, error } = await supabase
    .from("tasks")
    .select("project_id, github_issue_number")
    .in("project_id", projectIds)
    .not("github_issue_number", "is", null)
    .is("deleted_at", null);

  if (error) throw new Error(`Failed to load covered issue numbers: ${error.message}`);

  for (const row of (data ?? []) as TaskIssueNumberRow[]) {
    if (row.github_issue_number == null) continue;
    const set = covered.get(row.project_id) ?? new Set<number>();
    set.add(row.github_issue_number);
    covered.set(row.project_id, set);
  }

  return covered;
}

/** Row shape for `getIgnoredIssueKeysByProject` below. */
interface IgnoredIssueRow {
  project_id: string;
  github_issue_number: number;
}

/** Builds the stable `{projectId}:{issueNumber}` key both this module and the route use to identify an ignored issue. */
export function ignoredIssueKey(projectId: string, issueNumber: number): string {
  return `${projectId}:${issueNumber}`;
}

/**
 * Every issue an admin has already ignored, across the projects being
 * scanned — "honor ignored issues here" (an issue an admin has
 * explicitly ignored must not reappear in `GET /admin/new-issues`).
 * Returned as a `Set` of `ignoredIssueKey` values for O(1) lookup while
 * building the response.
 */
export async function getIgnoredIssueKeysByProject(
  supabase: SupabaseClient,
  projectIds: string[],
): Promise<Set<string>> {
  const ignored = new Set<string>();
  if (projectIds.length === 0) return ignored;

  const { data, error } = await supabase
    .from("ignored_github_issues")
    .select("project_id, github_issue_number")
    .in("project_id", projectIds);

  if (error) throw new Error(`Failed to load ignored issues: ${error.message}`);

  for (const row of (data ?? []) as IgnoredIssueRow[]) {
    ignored.add(ignoredIssueKey(row.project_id, row.github_issue_number));
  }

  return ignored;
}

/**
 * Thrown by `ignoreNewIssue` when `projectId` doesn't correspond to a
 * real project — kept distinct from a generic thrown `Error` so the
 * route handler can map it to a 404 without string-matching a message
 * (same pattern as `AdminProjectUpdateError` in src/db/adminProjects.ts).
 */
export class NewIssueProjectNotFoundError extends Error {
  constructor(projectId: string) {
    super(`Project ${projectId} not found`);
    this.name = "NewIssueProjectNotFoundError";
  }
}

/**
 * `POST /admin/new-issues/:id/ignore`'s actual write. Never touches
 * GitHub, and never requires the project to still be active — an ignore
 * recorded for a project that's since been soft-deleted is harmless (it
 * simply never surfaces again, the same as any other project's issues
 * once it drops out of `listActiveProjectsWithRepo`'s scan). Existence is
 * still checked so a fabricated/typo'd id gets a real 404 rather than an
 * opaque foreign-key violation surfacing as a 500 (rule 73: validate
 * before trusting a client-supplied reference).
 *
 * `upsert` with `ignoreDuplicates: true` (backed by sql/014's `unique
 * (project_id, github_issue_number)`) makes this idempotent — re-ignoring
 * an already-ignored issue is a harmless no-op, never a constraint-
 * violation error surfaced to the admin (rule 55).
 */
export async function ignoreNewIssue(
  supabase: SupabaseClient,
  adminId: string,
  projectId: string,
  issueNumber: number,
): Promise<void> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .maybeSingle<{ id: string }>();

  if (projectError) throw new Error(`Failed to look up project: ${projectError.message}`);
  if (!project) throw new NewIssueProjectNotFoundError(projectId);

  const { error } = await supabase.from("ignored_github_issues").upsert(
    {
      project_id: projectId,
      github_issue_number: issueNumber,
      ignored_by: adminId,
    },
    { onConflict: "project_id,github_issue_number", ignoreDuplicates: true },
  );

  if (error) throw new Error(`Failed to ignore issue: ${error.message}`);
}