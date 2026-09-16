import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeveloperRole, OnboardingTechStack } from "../types";
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