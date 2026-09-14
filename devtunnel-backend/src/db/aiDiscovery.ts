import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiConfirmationQueue,
  AiDiscoveredProject,
  AiDiscoveredTask,
  AiDiscoveredTool,
  AiDiscoveryCounters,
  AiDiscoveryDifficulty,
  AiDiscoveryStatus,
  DeveloperRole,
  ExperienceLevel,
  OnboardingGithubIdentity,
  OnboardingTechStack,
} from "../types";

const PROJECT_QUOTA = { beginner: 3, intermediate: 3, advanced: 1 } as const;

/**
 * How many tools get proposed per day, total — see `TOOL_CATEGORIES`
 * below for why this is smaller than the category list's length.
 *
 * Exported (not just module-local) because aiDiscoveryAgent.ts's
 * cross-registration reconciliation step (see listPublishedProjectsFor
 * Reconciliation/listPublishedToolsForReconciliation below) needs to
 * compute how much of today's shared tools budget is left after
 * `getTodayCounters` has already been read once, without re-deriving
 * the constant.
 */
export const TOOL_DAILY_QUOTA = 7;

/**
 * Fixed vocabulary for `AiDiscoveredTool.category`, and the full pool
 * `getTodayCounters` draws from — but NOT the day's tools quota anymore.
 * Chosen to span the whole developer lifecycle (build, test, secure,
 * ship, observe, document, collaborate, data/AI) so the catalog can
 * surface something useful for contributors no matter what kind of work
 * they're doing.
 *
 * The day's quota is capped at `TOOL_DAILY_QUOTA` (7) regardless of how
 * many categories are listed here — `getTodayCounters` shuffles this
 * list and only takes the categories still needed today, so which 7 of
 * the 18 get a tool varies day to day instead of always being the first
 * 7 in this array. Over multiple days every category gets its turn.
 */
export const TOOL_CATEGORIES = [
  "API Testing & Documentation",
  "Database & Data Tools",
  "DevOps & CI/CD",
  "Code Quality & Linting",
  "Monitoring & Observability",
  "Developer Documentation",
  "Design & UI Tooling",
  "Testing & QA Automation",
  "Security & Vulnerability Scanning",
  "Package & Dependency Management",
  "Build Tools & Bundlers",
  "Version Control & Git Tooling",
  "Authentication & Identity",
  "Cloud & Infrastructure as Code",
  "Containers & Orchestration",
  "Data Visualization & Analytics",
  "AI & Machine Learning Tooling",
  "Productivity & Developer Experience",
] as const;

/**
 * Fixed vocabulary for `AiDiscoveredProject.category` — the discovery agent picks
 * exactly one of these per project (see aiDiscoveryAgent.ts's prompt).
 * Unlike TOOL_CATEGORIES this has no per-day quota attached to it; it
 * exists purely so "category" is a controlled value, never a freeform
 * string it invents on the spot.
 */
export const PROJECT_CATEGORIES = [
  "CLI Tool",
  "Web Framework",
  "Library / SDK",
  "DevOps & Infrastructure",
  "Data & Machine Learning",
  "Mobile",
  "Game",
  "Other",
] as const;

/**
 * Canonical audience/role labels for `AiDiscoveredTool.labels` — kept in
 * exact sync with `SUGGESTED_LABELS` in
 * devtunnel-frontend/src/components/admin/opensource-tool-onboarding/steps/labels-step.tsx,
 * the chip list an Admin sees when manually tagging a tool.
 *
 * The manual admin flow deliberately keeps this open-ended (chips are
 * suggestions, not a closed enum, so an Admin can still type anything).
 * The AI discovery agent is different: given the same "who benefits from
 * this tool" question, an unconstrained model tends to invent loose,
 * inconsistent wording ("Backend", "backend devs", "Server-side") that
 * fragments search/filtering on the tools catalog. So the discovery
 * prompt in aiDiscoveryAgent.ts points the model at this exact list and
 * asks it to select every label that genuinely applies (not just one),
 * only reaching outside it when none of these fit at all.
 */
export const TOOL_AUDIENCE_LABELS = [
  "Frontend developer",
  "Backend developer",
  "Full-stack developer",
  "DevOps",
  "Data science",
  "Machine learning",
  "Mobile developer",
  "Designer",
  "Student",
  "Open source maintainer",
  "Security",
  "QA / Testing",
] as const;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fisher-Yates shuffle — never mutates the input array. */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = copy[i];
    copy[i] = copy[j] as T;
    copy[j] = tmp as T;
  }
  return copy;
}

export async function getTodayCounters(supabase: SupabaseClient): Promise<AiDiscoveryCounters> {
  const date = todayUtc();
  const { data, error } = await supabase
    .from("ai_discovery_daily_counters")
    .select("discovery_date, projects_beginner, projects_intermediate, projects_advanced, tools_found, tool_categories_found, tasks_found")
    .eq("discovery_date", date)
    .maybeSingle();

  if (error) throw error;

  const row = data ?? {
    discovery_date: date,
    projects_beginner: 0,
    projects_intermediate: 0,
    projects_advanced: 0,
    tools_found: 0,
    tool_categories_found: [],
    tasks_found: 0,
  };

  const foundCategories = Array.isArray(row.tool_categories_found)
    ? (row.tool_categories_found as string[])
    : [];

  // Only categories not yet covered today are candidates — then shuffle
  // THAT list (not the fixed source array) and cap it to whatever's left
  // of the day's TOOL_DAILY_QUOTA (7). This is what makes "which 7
  // categories" vary day to day across the full 18-category pool, while
  // still never proposing more than 7 tools total in a day.
  const toolsRemainingToday = Math.max(0, TOOL_DAILY_QUOTA - row.tools_found);
  const uncoveredCategories = TOOL_CATEGORIES.filter((c) => !foundCategories.includes(c));
  const toolCategoriesRemaining = shuffled(uncoveredCategories).slice(0, toolsRemainingToday);

  return {
    discoveryDate: row.discovery_date,
    projectsBeginner: row.projects_beginner,
    projectsIntermediate: row.projects_intermediate,
    projectsAdvanced: row.projects_advanced,
    toolsFound: row.tools_found,
    toolCategoriesFound: foundCategories,
    tasksFound: row.tasks_found,
    projectsRemaining: {
      beginner: Math.max(0, PROJECT_QUOTA.beginner - row.projects_beginner),
      intermediate: Math.max(0, PROJECT_QUOTA.intermediate - row.projects_intermediate),
      advanced: Math.max(0, PROJECT_QUOTA.advanced - row.projects_advanced),
    },
    toolCategoriesRemaining,
  };
}

export async function bumpCounters(
  supabase: SupabaseClient,
  deltas: { beginner?: number; intermediate?: number; advanced?: number; tools?: number; toolCategory?: string; tasks?: number },
): Promise<void> {
  const { error } = await supabase.rpc("bump_ai_discovery_counters", {
    p_date: todayUtc(),
    p_projects_beginner: deltas.beginner ?? 0,
    p_projects_intermediate: deltas.intermediate ?? 0,
    p_projects_advanced: deltas.advanced ?? 0,
    p_tools: deltas.tools ?? 0,
    p_tool_category: deltas.toolCategory ?? null,
    p_tasks: deltas.tasks ?? 0,
  });
  if (error) throw error;
}

export async function listExistingProjectFullNames(supabase: SupabaseClient): Promise<Set<string>> {
  const [onboarded, pending] = await Promise.all([
    supabase
      .from("projects")
      .select("github_full_name")
      .is("deleted_at", null)
      .not("github_full_name", "is", null),
    supabase.from("ai_discovered_projects").select("github_full_name").in("status", ["PENDING", "APPROVED"]),
  ]);
  if (onboarded.error) throw onboarded.error;
  if (pending.error) throw pending.error;
  const names = new Set<string>();
  for (const r of onboarded.data ?? []) if (r.github_full_name) names.add(r.github_full_name.toLowerCase());
  for (const r of pending.data ?? []) names.add(r.github_full_name.toLowerCase());
  return names;
}

export async function listExistingToolUrls(supabase: SupabaseClient): Promise<Set<string>> {
  const [onboarded, pending] = await Promise.all([
    supabase.from("opensource_tools").select("source_url"),
    supabase.from("ai_discovered_tools").select("source_url").in("status", ["PENDING", "APPROVED"]),
  ]);
  if (onboarded.error) throw onboarded.error;
  if (pending.error) throw pending.error;
  const urls = new Set<string>();
  for (const r of onboarded.data ?? []) urls.add(r.source_url.toLowerCase());
  for (const r of pending.data ?? []) urls.add(r.source_url.toLowerCase());
  return urls;
}

/**
 * Extracts a normalized, lowercase "owner/repo" key from a GitHub repo
 * URL, or null for anything that isn't a plain github.com repo URL
 * (self-hosted tool sites, GitLab, etc. have no project equivalent to
 * cross-register). Deliberately duplicated (not imported) from
 * aiDiscoveryAgent.ts's parseGithubOwnerRepo — this db/ module stays
 * framework-agnostic and free of lib/ imports; the two are kept in sync
 * by the same regex shape and are covered by the same "never guessed"
 * rule: a URL that doesn't match cleanly yields null, never a best-effort
 * guess.
 */
function githubKeyFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(/^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)\/?$/i);
  const owner = match?.[1];
  const repo = match?.[2];
  if (!owner || !repo) return null;
  return `${owner}/${repo.replace(/\.git$/i, "")}`.toLowerCase();
}

/**
 * ---------------------------------------------------------------------------
 * Cross-registration reconciliation (Phase 0, ahead of fresh GitHub search
 * in both runProjectDiscovery and runToolDiscovery — see
 * aiDiscoveryAgent.ts). Priority order per product spec:
 *   1. Every published open source tool that's GitHub-hosted must also
 *      exist as a project candidate.
 *   2. Every published project must also exist as a tool candidate.
 *   3. Only once both gaps are closed (or today's quota runs out) does
 *      the agent fall through to searching GitHub for something new.
 *
 * These two functions only ever READ the real published catalog tables
 * (`devtunnel.projects`, `devtunnel.opensource_tools`) — never the
 * `ai_discovered_*` queue, never the manual onboarding draft tables —
 * matching the same read boundary listOnboardedProjects/
 * listExistingProjectFullNames already hold themselves to.
 * ---------------------------------------------------------------------------
 */

export interface PublishedProjectForReconciliation {
  /** Normalized, lowercase "owner/repo" — the key reconciliation diffs on. */
  fullName: string;
  name: string;
  repositoryUrl: string;
  description: string | null;
  readme: string | null;
  primaryLanguage: string | null;
}

/**
 * Every ACTIVE, GitHub-linked, *non-deleted* published project — source
 * data for "project → tool" gaps.
 *
 * `status = 'ACTIVE'` alone is not enough: `deleteAdminProject`
 * (sql/008) soft-deletes a project by setting `deleted_at` and never
 * touches `status`, so a deleted project's `status` column is still
 * `'ACTIVE'`. Without the `deleted_at is null` guard below, every
 * deleted project keeps getting read back in here and re-proposed as a
 * tool candidate on each discovery run.
 */
export async function listPublishedProjectsForReconciliation(
  supabase: SupabaseClient,
): Promise<PublishedProjectForReconciliation[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("name, repo_url, github_full_name, github_description, custom_description, readme, primary_language")
    .eq("status", "ACTIVE")
    .is("deleted_at", null)
    .not("github_full_name", "is", null);
  if (error) throw error;

  const out: PublishedProjectForReconciliation[] = [];
  for (const r of data ?? []) {
    const fullName = (r.github_full_name as string | null)?.toLowerCase();
    if (!fullName) continue;
    out.push({
      fullName,
      name: r.name,
      repositoryUrl: r.repo_url ?? `https://github.com/${r.github_full_name}`,
      description: (r.custom_description as string | null) ?? (r.github_description as string | null) ?? null,
      readme: r.readme ?? null,
      primaryLanguage: r.primary_language ?? null,
    });
  }
  return out;
}

export interface PublishedToolForReconciliation {
  /** Normalized, lowercase "owner/repo" — null-filtered before this is built, so always present here. */
  fullName: string;
  name: string;
  sourceUrl: string;
  description: string | null;
  readme: string | null;
  primaryLanguage: string | null;
}

/**
 * Every published tool whose source_url is a plain GitHub repo URL —
 * source data for "tool → project" gaps. Tools hosted on their own
 * website (non-GitHub source_url) are silently skipped: there is no
 * repository to create a project candidate from, and this pipeline never
 * fabricates one.
 */
export async function listPublishedToolsForReconciliation(
  supabase: SupabaseClient,
): Promise<PublishedToolForReconciliation[]> {
  const { data, error } = await supabase
    .from("opensource_tools")
    .select("name, source_url, fetched_description, custom_description, readme, primary_language");
  if (error) throw error;

  const out: PublishedToolForReconciliation[] = [];
  for (const r of data ?? []) {
    const fullName = githubKeyFromUrl(r.source_url as string);
    if (!fullName) continue;
    out.push({
      fullName,
      name: r.name,
      sourceUrl: r.source_url,
      description: (r.custom_description as string | null) ?? (r.fetched_description as string | null) ?? null,
      readme: r.readme ?? null,
      primaryLanguage: r.primary_language ?? null,
    });
  }
  return out;
}

export interface OnboardedProjectRef {
  id: string;
  slug: string;
  name: string;
  githubOwner: string;
  githubRepoName: string;
  githubFullName: string;
}

/**
 * Feeds `runTaskDiscovery` (aiDiscoveryAgent.ts) — the set of projects
 * whose open GitHub issues get scanned and turned into task candidates.
 * Same `deleted_at is null` requirement as
 * `listPublishedProjectsForReconciliation` above and for the same
 * reason: soft-deleting a project never changes its `status`, so this
 * must not rely on `status = 'ACTIVE'` alone or a deleted project's
 * issues keep getting proposed as new tasks run after run.
 */
export async function listOnboardedProjects(supabase: SupabaseClient): Promise<OnboardedProjectRef[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, slug, name, github_owner, github_repo_name, github_full_name")
    .eq("status", "ACTIVE")
    .is("deleted_at", null)
    .not("github_full_name", "is", null);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    githubOwner: r.github_owner,
    githubRepoName: r.github_repo_name,
    githubFullName: r.github_full_name,
  }));
}

export async function listExistingTaskIssueNumbers(supabase: SupabaseClient, projectId: string): Promise<Set<number>> {
  const [tasks, pending] = await Promise.all([
    supabase.from("tasks").select("github_issue_number").eq("project_id", projectId).not("github_issue_number", "is", null),
    supabase.from("ai_discovered_tasks").select("issue_number").eq("project_id", projectId).in("status", ["PENDING", "APPROVED"]),
  ]);
  if (tasks.error) throw tasks.error;
  if (pending.error) throw pending.error;
  const numbers = new Set<number>();
  for (const r of tasks.data ?? []) if (r.github_issue_number !== null) numbers.add(r.github_issue_number);
  for (const r of pending.data ?? []) numbers.add(r.issue_number);
  return numbers;
}

export interface NewDiscoveredProject {
  repositoryUrl: string;
  githubOwner: string;
  githubRepoName: string;
  githubFullName: string;
  githubDescription: string | null;
  readme: string | null;
  primaryLanguage: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  techStack: OnboardingTechStack;
  description: string;
  category: string;
  difficulty: AiDiscoveryDifficulty;
  aiReasoning: string;
}

export async function insertDiscoveredProject(supabase: SupabaseClient, p: NewDiscoveredProject): Promise<void> {
  const { error } = await supabase.from("ai_discovered_projects").insert({
    discovery_date: todayUtc(),
    repository_url: p.repositoryUrl,
    github_owner: p.githubOwner,
    github_repo_name: p.githubRepoName,
    github_full_name: p.githubFullName,
    github_description: p.githubDescription,
    readme: p.readme,
    primary_language: p.primaryLanguage,
    stars: p.stars,
    forks: p.forks,
    open_issues: p.openIssues,
    tech_stack: p.techStack,
    description: p.description,
    category: p.category,
    difficulty: p.difficulty,
    ai_reasoning: p.aiReasoning,
  });
  if (error) throw error;
}

export interface NewDiscoveredTool {
  sourceUrl: string;
  name: string;
  fetchedDescription: string | null;
  readme: string | null;
  primaryLanguage: string | null;
  category: string;
  labels: string[];
  description: string;
  setupGuide: string;
  aiReasoning: string;
}

export async function insertDiscoveredTool(supabase: SupabaseClient, t: NewDiscoveredTool): Promise<void> {
  const { error } = await supabase.from("ai_discovered_tools").insert({
    discovery_date: todayUtc(),
    source_url: t.sourceUrl,
    name: t.name,
    fetched_description: t.fetchedDescription,
    readme: t.readme,
    primary_language: t.primaryLanguage,
    category: t.category,
    labels: t.labels,
    description: t.description,
    setup_guide: t.setupGuide,
    ai_reasoning: t.aiReasoning,
  });
  if (error) throw error;
}

export interface NewDiscoveredTask {
  projectId: string;
  issueNumber: number;
  issueTitle: string;
  issueUrl: string;
  issueBody: string | null;
  issueLabels: string[];
  githubAuthor: OnboardingGithubIdentity | null;
  suggestedRoles: DeveloperRole[];
  suggestedDifficulty: ExperienceLevel | null;
  taskSummary: string;
  aiReasoning: string;
}

export async function insertDiscoveredTask(supabase: SupabaseClient, t: NewDiscoveredTask): Promise<void> {
  const { error } = await supabase.from("ai_discovered_tasks").insert({
    discovery_date: todayUtc(),
    project_id: t.projectId,
    issue_number: t.issueNumber,
    issue_title: t.issueTitle,
    issue_url: t.issueUrl,
    issue_body: t.issueBody,
    issue_labels: t.issueLabels,
    github_author: t.githubAuthor,
    suggested_roles: t.suggestedRoles,
    suggested_difficulty: t.suggestedDifficulty,
    task_summary: t.taskSummary,
    ai_reasoning: t.aiReasoning,
  });
  if (error) throw error;
}

// --- Listing for the admin frontend ----------------------------------------

function toProject(row: any): AiDiscoveredProject {
  return {
    id: row.id,
    discoveryDate: row.discovery_date,
    repositoryUrl: row.repository_url,
    githubOwner: row.github_owner,
    githubRepoName: row.github_repo_name,
    githubFullName: row.github_full_name,
    githubDescription: row.github_description,
    readme: row.readme,
    primaryLanguage: row.primary_language,
    stars: row.stars,
    forks: row.forks,
    openIssues: row.open_issues,
    techStack: row.tech_stack ?? {},
    description: row.description ?? "",
    category: row.category ?? "",
    difficulty: row.difficulty,
    aiReasoning: row.ai_reasoning,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toTool(row: any): AiDiscoveredTool {
  return {
    id: row.id,
    discoveryDate: row.discovery_date,
    sourceUrl: row.source_url,
    name: row.name,
    fetchedDescription: row.fetched_description,
    readme: row.readme,
    primaryLanguage: row.primary_language,
    category: row.category,
    labels: Array.isArray(row.labels) ? row.labels : [],
    description: row.description ?? "",
    setupGuide: row.setup_guide ?? "",
    aiReasoning: row.ai_reasoning,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toTask(row: any): AiDiscoveredTask {
  return {
    id: row.id,
    discoveryDate: row.discovery_date,
    projectId: row.project_id,
    projectName: row.projects?.name ?? "",
    projectSlug: row.projects?.slug ?? "",
    issueNumber: row.issue_number,
    issueTitle: row.issue_title,
    issueUrl: row.issue_url,
    issueBody: row.issue_body,
    issueLabels: Array.isArray(row.issue_labels) ? row.issue_labels : [],
    githubAuthor: row.github_author,
    suggestedRoles: Array.isArray(row.suggested_roles) ? row.suggested_roles : [],
    suggestedDifficulty: row.suggested_difficulty,
    taskSummary: row.task_summary ?? "",
    aiReasoning: row.ai_reasoning,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function listDiscoveredProjects(supabase: SupabaseClient, status: AiDiscoveryStatus): Promise<AiDiscoveredProject[]> {
  const { data, error } = await supabase
    .from("ai_discovered_projects")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toProject);
}

export async function listDiscoveredTools(supabase: SupabaseClient, status: AiDiscoveryStatus): Promise<AiDiscoveredTool[]> {
  const { data, error } = await supabase
    .from("ai_discovered_tools")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toTool);
}

export async function listDiscoveredTasks(supabase: SupabaseClient, status: AiDiscoveryStatus): Promise<AiDiscoveredTask[]> {
  const { data, error } = await supabase
    .from("ai_discovered_tasks")
    .select("*, projects(name, slug)")
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(toTask);
}

export async function getConfirmationQueue(supabase: SupabaseClient): Promise<AiConfirmationQueue> {
  const [projects, tools, tasks] = await Promise.all([
    listDiscoveredProjects(supabase, "PENDING"),
    listDiscoveredTools(supabase, "PENDING"),
    listDiscoveredTasks(supabase, "PENDING"),
  ]);
  return { projects, tools, tasks };
}

// --- Approve / reject --------------------------------------------------

export async function approveDiscoveredProject(supabase: SupabaseClient, id: string, adminId: string) {
  const { data, error } = await supabase.rpc("approve_ai_discovered_project", { p_id: id, p_admin_id: adminId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function approveDiscoveredTool(supabase: SupabaseClient, id: string, adminId: string) {
  const { data, error } = await supabase.rpc("approve_ai_discovered_tool", { p_id: id, p_admin_id: adminId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function approveDiscoveredTask(supabase: SupabaseClient, id: string, adminId: string) {
  const { data, error } = await supabase.rpc("approve_ai_discovered_task", { p_id: id, p_admin_id: adminId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function rejectDiscoveredItem(
  supabase: SupabaseClient,
  table: "ai_discovered_projects" | "ai_discovered_tools" | "ai_discovered_tasks",
  id: string,
  adminId: string,
): Promise<void> {
  const { error } = await supabase
    .from(table)
    .update({ status: "REJECTED", reviewed_by: adminId, reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "PENDING");
  if (error) throw error;
}