import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminProjectStatus,
  AdminTaskStatus,
  DeveloperRole,
  OnboardingGithubIdentity,
  OnboardingTechStack,
} from "../types";
import { toOnboardingTechStackOrNull } from "./adminProjects";
import { flattenTechStack } from "./adminTasks";

export interface ProjectSummary {
  slug: string;
  name: string;
  description: string;
  primaryTech: string;
  matchPercent?: number;
  matchRole?: string;
  repositoryFullName?: string;
}

export interface ContributorMatchProfile {
  developerRoles: DeveloperRole[];
  skills: string[];
  technologies: string[];
}

interface AvailableProjectRow {
  slug: string;
  name: string;
  description: string | null;
  primary_language: string | null;
  tech_stack: unknown;
  github_full_name: string | null;
  created_at: string;
}

const AVAILABLE_PROJECT_COLUMNS =
  "slug, name, description, primary_language, tech_stack, github_full_name, created_at";

const AVAILABLE_PROJECTS_LIMIT = 500;

const ROLE_MATCH_LABELS: Record<"FRONTEND" | "BACKEND" | "FULL_STACK", string> = {
  FRONTEND: "Frontend Developer",
  BACKEND: "Backend Developer",
  FULL_STACK: "Full Stack Developer",
};

function toPrimaryTech(primaryLanguage: string | null, techStack: OnboardingTechStack | null): string {
  if (primaryLanguage) return primaryLanguage;
  const [firstTag] = flattenTechStack(techStack);
  return firstTag ?? "General";
}

function computeMatch(
  techStack: OnboardingTechStack | null,
  primaryLanguage: string | null,
  profile: ContributorMatchProfile | null,
): Pick<ProjectSummary, "matchPercent" | "matchRole"> {
  if (!profile) return {};

  const contributorTags = new Set(
    [...profile.technologies, ...profile.skills].map((tag) => tag.toLowerCase()),
  );
  if (contributorTags.size === 0) return {};

  const projectTagsRaw = flattenTechStack(techStack);
  if (primaryLanguage) projectTagsRaw.push(primaryLanguage);
  const projectTags = Array.from(new Set(projectTagsRaw.map((tag) => tag.toLowerCase())));
  if (projectTags.length === 0) return {};

  const matchedTags = projectTags.filter((tag) => contributorTags.has(tag));
  if (matchedTags.length === 0) return {};

  const matchPercent = Math.round((matchedTags.length / projectTags.length) * 100);

  const frontendTags = new Set((techStack?.frontend ?? []).map((tag) => tag.toLowerCase()));
  const backendTags = new Set((techStack?.backend ?? []).map((tag) => tag.toLowerCase()));
  const frontendMatches = matchedTags.filter((tag) => frontendTags.has(tag)).length;
  const backendMatches = matchedTags.filter((tag) => backendTags.has(tag)).length;

  const canFrontend = profile.developerRoles.includes("FRONTEND") || profile.developerRoles.includes("FULL_STACK");
  const canBackend = profile.developerRoles.includes("BACKEND") || profile.developerRoles.includes("FULL_STACK");

  let matchRole: string | undefined;
  if (canFrontend && canBackend && frontendMatches > 0 && backendMatches > 0) {
    matchRole = ROLE_MATCH_LABELS.FULL_STACK;
  } else if (canBackend && backendMatches > 0 && backendMatches >= frontendMatches) {
    matchRole = ROLE_MATCH_LABELS.BACKEND;
  } else if (canFrontend && frontendMatches > 0) {
    matchRole = ROLE_MATCH_LABELS.FRONTEND;
  }

  return matchRole ? { matchPercent, matchRole } : { matchPercent };
}

export async function listAvailableProjects(
  supabase: SupabaseClient,
  profile: ContributorMatchProfile | null,
): Promise<ProjectSummary[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(AVAILABLE_PROJECT_COLUMNS)
    .eq("status", "ACTIVE")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(AVAILABLE_PROJECTS_LIMIT);

  if (error) throw new Error(`Failed to load available projects: ${error.message}`);

  const rows = (data ?? []) as unknown as AvailableProjectRow[];

  return rows.map((row) => {
    const techStack = toOnboardingTechStackOrNull(row.tech_stack);

    return {
      slug: row.slug,
      name: row.name,
      description: row.description ?? "",
      primaryTech: toPrimaryTech(row.primary_language, techStack),
      ...computeMatch(techStack, row.primary_language, profile),
      ...(row.github_full_name ? { repositoryFullName: row.github_full_name } : {}),
    };
  });
}

/* ---------------------------------------------------------------------------
 * Single-project detail — `GET /projects/:slug` (src/routes/projects.ts),
 * the View Project page devtunnel-frontend's
 * `lib/projects/{types,api}.ts` calls.
 * ------------------------------------------------------------------------ */

/**
 * Everything the detail route reads out of Supabase for one project:
 * the stored row, plus the three aggregate counts.
 *
 * Deliberately stops there. `license` and `pushedAt` are NOT on this
 * shape because `devtunnel.projects` genuinely doesn't store them (sql/006
 * captures stars/forks/open_issues/readme/author/contributors at
 * onboarding time and nothing else) — the route layers those on from a
 * live, cached GitHub read instead of this module inventing a stand-in
 * (rule 21: never report something that wasn't really fetched).
 */
export interface ProjectDetailRecord {
  id: string;
  slug: string;
  name: string;
  /** Resolved at onboarding-completion time by `complete_project_onboarding` (sql/007). */
  description: string | null;
  repositoryUrl: string;
  repositoryFullName: string;
  /** Owner/repo split off `github_full_name`, ready for a GitHub call. `null` when the project has no repository recorded. */
  repo: { owner: string; repo: string } | null;
  author: OnboardingGithubIdentity | null;
  primaryTech: string;
  /** Flattened curated tech stack — the same flat list `TaskProjectRef.techStack` carries. */
  techStack: string[];
  /** README as imported at onboarding time, never re-fetched here. */
  readme: string | null;
  status: AdminProjectStatus;
  /** GitHub snapshot captured at onboarding — the route prefers live values and falls back to these. */
  storedStars: number;
  storedForks: number;
  storedOpenIssues: number;
  /** Count of the stored `github_contributors` snapshot — never mixed with `devTunnelContributorCount`. */
  githubContributorCount: number;
  /** Distinct users who completed a task or landed a merged PR here (sql/015) — not people who merely joined. */
  devTunnelContributorCount: number;
  taskCount: number;
  createdAt: string;
  matchPercent?: number;
  matchRole?: string;
}

interface ProjectDetailRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  repo_url: string | null;
  github_owner: string | null;
  github_full_name: string | null;
  github_author: OnboardingGithubIdentity | null;
  github_contributors: OnboardingGithubIdentity[] | null;
  readme: string | null;
  primary_language: string | null;
  stars: number | null;
  forks: number | null;
  open_issues: number | null;
  tech_stack: unknown;
  status: AdminProjectStatus;
  created_at: string;
}

/**
 * Explicit column list, never `select("*")` (rule 23). Read off the base
 * `devtunnel.projects` table rather than the `admin_project_list` view
 * because the view doesn't expose `readme`, `primary_language`, `stars`,
 * `forks`, or `open_issues` — the same reason
 * `getAdminProjectDetailById` reads its own `DETAIL_EXTRA_COLUMNS` off
 * the base table.
 */
const DETAIL_COLUMNS =
  "id, slug, name, description, repo_url, github_owner, github_full_name, github_author, " +
  "github_contributors, readme, primary_language, stars, forks, open_issues, tech_stack, status, created_at";

/** The three aggregates, read off the existing view rather than recomputed here. */
const DETAIL_COUNT_COLUMNS = "task_count, devtunnel_contributor_count, github_contributor_count";

interface ProjectDetailCountsRow {
  task_count: number;
  devtunnel_contributor_count: number;
  github_contributor_count: number;
}

/**
 * One project by slug, or `null` when it doesn't exist, has been
 * soft-deleted, or isn't `ACTIVE` — all three are "this page doesn't
 * exist" from a contributor's side, and the route turns every one of
 * them into the same 404 rather than leaking which it was.
 *
 * Reads the aggregate counts from `devtunnel.admin_project_list`
 * (sql/015) rather than recomputing them. The view's name says "admin",
 * but the aggregates in it are neither admin-only nor
 * admin-authenticated — they're just correlated counts over
 * `devtunnel.tasks` and `devtunnel.pull_requests`. Defining a second
 * view with the same subqueries is exactly the duplication rule 51 warns
 * about, and the two would drift the first time either definition
 * changed. Same precedent `src/db/tasks.ts` sets by reading
 * `admin_task_list` for the contributor-facing Tasks page.
 *
 * Two round trips rather than one join: PostgREST can't join a view to a
 * base table without a declared relationship, and both queries hit a
 * unique index on `slug`, so this is two cheap point lookups rather than
 * anything worth contorting the query shape for.
 */
export async function getProjectDetailBySlug(
  supabase: SupabaseClient,
  slug: string,
  profile: ContributorMatchProfile | null,
): Promise<ProjectDetailRecord | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(DETAIL_COLUMNS)
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle<ProjectDetailRow>();

  if (error) throw new Error(`Failed to load project: ${error.message}`);
  if (!data) return null;
  // An archived project is no longer something a contributor can pick up
  // work on, and `listAvailableProjects` already filters it out of the
  // catalog — serving its detail page anyway would be a dead end reachable
  // only by a stale link.
  if (data.status !== "ACTIVE") return null;

  const { data: countsData, error: countsError } = await supabase
    .from("admin_project_list")
    .select(DETAIL_COUNT_COLUMNS)
    .eq("slug", slug)
    .maybeSingle<ProjectDetailCountsRow>();

  if (countsError) throw new Error(`Failed to load project counts: ${countsError.message}`);

  const techStack = toOnboardingTechStackOrNull(data.tech_stack);

  // Defensive owner/repo resolution, same as `listActiveProjectsWithRepo`
  // (src/db/adminNewIssues.ts): prefer the stored `github_owner`, fall
  // back to splitting `github_full_name`, and give up rather than guess
  // when neither yields both halves (rule 73).
  const fullName = data.github_full_name;
  const repoName = fullName ? fullName.split("/")[1] : undefined;
  const ownerName = data.github_owner ?? (fullName ? fullName.split("/")[0] : undefined);

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    description: data.description,
    repositoryUrl: data.repo_url ?? "",
    repositoryFullName: fullName ?? "",
    repo: ownerName && repoName ? { owner: ownerName, repo: repoName } : null,
    author: data.github_author,
    primaryTech: toPrimaryTech(data.primary_language, techStack),
    techStack: flattenTechStack(data.tech_stack),
    readme: data.readme,
    status: data.status,
    storedStars: data.stars ?? 0,
    storedForks: data.forks ?? 0,
    storedOpenIssues: data.open_issues ?? 0,
    // Prefer the view's count; fall back to the stored snapshot's own
    // length if the view row is somehow missing, rather than reporting a
    // confident 0 for a project that does have contributors.
    githubContributorCount:
      countsData?.github_contributor_count ?? (data.github_contributors?.length ?? 0),
    devTunnelContributorCount: countsData?.devtunnel_contributor_count ?? 0,
    taskCount: countsData?.task_count ?? 0,
    createdAt: data.created_at,
    ...computeMatch(techStack, data.primary_language, profile),
  };
}

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