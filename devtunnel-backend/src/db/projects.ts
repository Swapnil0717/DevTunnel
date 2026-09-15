import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeveloperRole, OnboardingTechStack } from "../types";
import { toOnboardingTechStackOrNull } from "./adminProjects";
import { flattenTechStack } from "./adminTasks";

/**
 * Contributor — Projects on DevTunnel (`/projects` — "Projects on
 * Devtunnel" in `AppSidebar`/`AppBottomNav`,
 * devtunnel-frontend/src/lib/home/{types,api}.ts). Backs
 * `GET /projects/available` (src/routes/projects.ts), the one real,
 * spec'd endpoint `devtunnel-frontend/src/app/(protected)/projects/page.tsx`
 * and the home page's "Recommended for you" section both call
 * (devtunnel_workflow.txt Module 3 — "Contributor Home").
 *
 * Deliberately NOT the same data source as `GET /github-projects`
 * (src/routes/githubProjects.ts): that route never touches Supabase and
 * lists every public GitHub repository worth browsing. This reads
 * `devtunnel.projects` directly — the handful of repositories an admin
 * has actually onboarded through the Project Onboarding wizard
 * (sql/006_add_project_onboarding.sql, `complete_project_onboarding`) —
 * DevTunnel's own curated catalog, same distinction
 * `src/routes/githubProjects.ts`'s doc comment draws from the other side.
 *
 * Reads `devtunnel.projects` (the base table) rather than the
 * `devtunnel.admin_project_list` view `src/db/adminProjects.ts` uses for
 * the Admin Projects table: that view's exposed column list
 * (sql/015_fix_admin_project_list_task_count.sql) never includes
 * `description` (only admin-only aggregate counts a contributor has no
 * use for), so the contributor-facing summary this route needs is a
 * separate, narrower explicit column list straight off the base table —
 * same "select exactly what the caller needs, never `select(\"*\")`"
 * rule (Backend_Development_Rules.txt rule 23) `LIST_COLUMNS` in
 * src/db/adminProjects.ts already follows for its own, different column
 * set.
 */

/**
 * A single row of the contributor "Projects on Devtunnel" list — mirrors
 * `ProjectSummary` in devtunnel-frontend/src/lib/home/types.ts exactly.
 * `matchPercent`/`matchRole` are omitted (not just `undefined`, actually
 * absent from the JSON) whenever there's no real signal to compute them
 * from — see `computeMatch` below — never a fabricated 0%/guessed role
 * (Backend_Development_Rules.txt rule 38: never fake a metric).
 */
export interface ProjectSummary {
  slug: string;
  name: string;
  description: string;
  primaryTech: string;
  matchPercent?: number;
  matchRole?: string;
}

/**
 * The signed-in contributor's own onboarding answers, used only to power
 * this route's match scoring — passed in by the route from `c.get("user")`
 * (`AuthUser`, already attached by `requireAuth`) rather than re-queried
 * here, same as `ContributorProfile` in src/db/tasks.ts.
 */
export interface ContributorMatchProfile {
  developerRoles: DeveloperRole[];
  skills: string[];
  technologies: string[];
}

/**
 * Raw row shape as read off `devtunnel.projects` by `AVAILABLE_PROJECT_COLUMNS`
 * below. Every column here is confirmed to exist: `slug`/`name`/`description`
 * from sql/004_add_devtunnel_contributions.sql, `primary_language`/`tech_stack`
 * from sql/006_add_project_onboarding.sql.
 */
interface AvailableProjectRow {
  slug: string;
  name: string;
  description: string | null;
  primary_language: string | null;
  tech_stack: unknown;
  created_at: string;
}

const AVAILABLE_PROJECT_COLUMNS =
  "slug, name, description, primary_language, tech_stack, created_at";

/**
 * Upper bound on how many active projects one `GET /projects/available`
 * request reads. Unlike `GET /tasks`/`GET /admin/projects`, this endpoint
 * has no keyset pagination on the frontend side — `getRecommendedProjects`
 * (devtunnel-frontend/src/lib/home/api.ts) reads the response as one flat
 * `ProjectSummary[]`, not a paginated page — so rather than add pagination
 * nothing currently consumes, this reads every active project up to a
 * generous ceiling. A project only ever gets here by going through the
 * admin Project Onboarding wizard one at a time, so this list stays small
 * in practice; 500 is comfortably above any real installation today.
 */
const AVAILABLE_PROJECTS_LIMIT = 500;

/**
 * Only the two role labels that have a real, project-level tech-stack
 * signal to back them (see `computeMatch` below). DOCUMENTATION/TESTING/
 * DEVOPS are deliberately excluded — a project's `tech_stack` jsonb has no
 * "docs"/"testing"/"devops" category to match against, and DevTunnel has
 * no other project-level signal for those roles today, so fabricating a
 * label for them would be a fake metric (rule 38).
 */
const ROLE_MATCH_LABELS: Record<"FRONTEND" | "BACKEND" | "FULL_STACK", string> = {
  FRONTEND: "Frontend Developer",
  BACKEND: "Backend Developer",
  FULL_STACK: "Full Stack Developer",
};

/**
 * The project's single headline technology — `ProjectsGrid`/
 * `DevtunnelProjectCard`'s one-tag display. Prefers the real, GitHub-
 * sourced `primary_language` (sql/006) captured at onboarding time; falls
 * back to the first tag of the admin-curated `tech_stack` (languages,
 * then frontend/backend/frameworks/..., same order `flattenTechStack`
 * already defines) only when a project was onboarded before GitHub
 * language detection populated that column. Never a hardcoded placeholder
 * string standing in for real data — "General" is only ever shown when a
 * project genuinely has no tech information recorded at all.
 */
function toPrimaryTech(primaryLanguage: string | null, techStack: OnboardingTechStack | null): string {
  if (primaryLanguage) return primaryLanguage;
  const [firstTag] = flattenTechStack(techStack);
  return firstTag ?? "General";
}

/**
 * Weighted-overlap match score between one project and the signed-in
 * contributor's own onboarding profile (devtunnel_workflow.txt Module 3's
 * "Skills + Interests + Experience -> Project Scores -> Recommended
 * Projects" algorithm), expressed as the `matchPercent`/`matchRole` pair
 * `ProjectSummary` carries.
 *
 * Deliberately returns `{}` (both fields simply absent) rather than a
 * fabricated 0%/generic role whenever there's no real signal to score:
 *  - `profile` is `null` — the contributor hasn't completed onboarding,
 *    so there is nothing of theirs to match against (mirrors `GET /tasks
 *    ?recommended=true`'s 422 in src/routes/tasks.ts, but softer here:
 *    this route still returns the project, just without a score, since
 *    `/projects` is a browsable list, not an opt-in recommendation feed).
 *  - the contributor entered no skills/technologies during onboarding.
 *  - the project has no tech-stack/`primary_language` info recorded at
 *    all — nothing to compare against.
 *  - the overlap is genuinely zero.
 *
 * `matchPercent` = the share of the project's own tech tags (languages,
 * frontend, backend, frameworks, databases, libraries, buildTools, plus
 * `primary_language`) that also appear in the contributor's own
 * `skills ∪ technologies` (case-insensitive) — "how much of what this
 * project uses do you already know", matching the workflow doc's
 * "React + Node.js -> Project A -> 95% relevance" example shape.
 *
 * `matchRole` picks whichever of the contributor's own onboarding roles
 * best explains the overlap, based on which tech-stack *category*
 * (`frontend/backend`) the matched tags actually landed in — same
 * "a Full Stack contributor can match on any category" bypass
 * `ContributorProfile`/`matchProfile` in src/db/tasks.ts already applies
 * for tasks, adapted to a single best-fit label instead of a boolean.
 */
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

/**
 * Every active, non-deleted DevTunnel project, newest-onboarded-first,
 * mapped to the contributor-facing `ProjectSummary` shape and (when
 * `profile` is provided) scored against that contributor's own onboarding
 * answers. Backs `GET /projects/available`.
 *
 * `status = 'ACTIVE'` and `deleted_at is null` together are this table's
 * own "really available to browse" definition (sql/006's `project_status`
 * enum + sql/008's soft-delete columns) — the same predicate
 * `devtunnel.admin_project_list` applies via its `where` clause
 * (sql/015), just expressed directly here since this route reads the
 * base table instead of that view.
 */
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
    };
  });
}