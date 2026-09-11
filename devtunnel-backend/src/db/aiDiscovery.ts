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

export const TOOL_CATEGORIES = [
  "API Testing & Documentation",
  "Database & Data Tools",
  "DevOps & CI/CD",
  "Code Quality & Linting",
  "Monitoring & Observability",
  "Developer Documentation",
  "Design & UI Tooling",
] as const;

/**
 * Fixed vocabulary for `AiDiscoveredProject.category` — Gemini picks
 * exactly one of these per project (see aiDiscoveryAgent.ts's prompt).
 * Unlike TOOL_CATEGORIES this has no per-day quota attached to it; it
 * exists purely so "category" is a controlled value, never a freeform
 * string Gemini invents on the spot.
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

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
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
    toolCategoriesRemaining: TOOL_CATEGORIES.filter((c) => !foundCategories.includes(c)),
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
    supabase.from("projects").select("github_full_name").not("github_full_name", "is", null),
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

export interface OnboardedProjectRef {
  id: string;
  slug: string;
  name: string;
  githubOwner: string;
  githubRepoName: string;
  githubFullName: string;
}

export async function listOnboardedProjects(supabase: SupabaseClient): Promise<OnboardedProjectRef[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, slug, name, github_owner, github_repo_name, github_full_name")
    .eq("status", "ACTIVE")
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