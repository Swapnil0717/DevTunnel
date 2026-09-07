/**
 * Cloudflare Worker bindings + environment variables.
 *
 * Non-secret values are declared in wrangler.toml `[vars]`. Secrets
 * (marked below) are never put in wrangler.toml — they're set with
 * `wrangler secret put <name>` in production and `.dev.vars` locally
 * (Backend_Development_Rules.txt rules 6–7).
 */
 export interface Env {
  // --- KV ---
  // Also doubles as a lightweight JSON response cache (see src/lib/cache.ts)
  // for the GitHub contribution-calendar endpoints — see that file for why
  // a second KV namespace wasn't introduced for that.
  RATE_LIMIT_KV: KVNamespace;

  // --- Non-secret config (wrangler.toml [vars]) ---
  ENVIRONMENT: "production" | "staging" | "development";
  GITHUB_CALLBACK_URL: string;
  FRONTEND_URL: string;
  ALLOWED_ORIGINS: string;
  COOKIE_DOMAIN?: string;
  SUPABASE_URL: string;
  SUPABASE_DB_SCHEMA: string;
  GITHUB_CLIENT_ID: string;
  SESSION_TTL_DAYS: string;

  // --- Secrets (wrangler secret put / .dev.vars) ---
  GITHUB_CLIENT_SECRET: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SESSION_HMAC_SECRET: string;
  GITHUB_TOKEN_ENCRYPTION_KEY: string;
}

/** Values attached to the Hono context by middleware. */
export interface Variables {
  requestId: string;
  user: AuthUser | null;
}

export type UserRole = "CONTRIBUTOR" | "MAINTAINER" | "ADMIN";

/**
 * Onboarding wizard enums (devtunnel_workflow.txt, Module C1 — "User
 * onboarding" screen). Mirror the identically-named types in
 * devtunnel-frontend/src/lib/onboarding/types.ts exactly.
 */
export type DeveloperRole =
  | "FRONTEND"
  | "BACKEND"
  | "FULL_STACK"
  | "DOCUMENTATION"
  | "TESTING"
  | "DEVOPS";
export type ExperienceLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
export type ContributorIntent = "START_PROJECT" | "FIND_PROJECT";

/**
 * Validated payload for `PATCH /auth/onboarding`. Mirrors `OnboardingData`
 * in devtunnel-frontend/src/lib/onboarding/types.ts. Unlike the frontend
 * type (which allows `null` while the wizard is in progress), the fields
 * required by the wizard's own step-gating (`developerRole`,
 * `experienceLevel`, `intent`) are non-nullable here — see the Zod schema
 * in routes/auth.ts, which is the actual source of truth for what the
 * backend accepts.
 */
export interface OnboardingData {
  bio: string;
  skills: string[];
  technologies: string[];
  developerRole: DeveloperRole;
  experienceLevel: ExperienceLevel;
  interests: string[];
  intent: ContributorIntent;
}

/**
 * Frontend-safe user shape. Mirrors `AuthUser` in
 * devtunnel-frontend/src/lib/auth/types.ts exactly — every field the
 * frontend reads must be present, and nothing more sensitive (no
 * githubId, no encrypted tokens, no internal flags) is ever included
 * (Backend_Development_Rules.txt rule 9).
 *
 * `skills`/`technologies`/`developerRole`/`experienceLevel`/`interests`/
 * `intent` are the onboarding wizard's own fields (sql/002) — surfaced
 * here so the profile page can render every field asked for during
 * onboarding, not just bio/skills/technologies as before.
 *
 * `isMaintainer` is NOT a column on `users` — it's derived per-request
 * from `devtunnel.project_maintainers` (db/devtunnelStats.ts
 * `getIsMaintainer`) and folded in by whichever route builds this object
 * (middleware/auth.ts, routes/auth.ts `/me` and `/onboarding`). See
 * db/users.ts `toAuthUser` for where it's threaded in.
 */
export interface AuthUser {
  id: string;
  email: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatarUrl: string | null;
  githubUsername: string | null;
  githubProfileUrl: string | null;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
  onboardingCompleted: boolean;
  skills: string[];
  technologies: string[];
  developerRole: DeveloperRole | null;
  experienceLevel: ExperienceLevel | null;
  interests: string[];
  intent: ContributorIntent | null;
  isMaintainer: boolean;
}

/**
 * Full row shape as stored in `devtunnel.users` (includes private fields).
 * `github_*_token_encrypted` columns hold AES-256-GCM ciphertext only
 * (src/lib/crypto.ts) — the raw token is never stored, logged, or
 * returned to any client (rules 6, 8, 59). Only src/db/githubTokens.ts
 * ever selects these columns; every other query in this codebase selects
 * an explicit column list that omits them (rule 23: avoid SELECT *).
 */
export interface UserRow {
  id: string;
  email: string;
  username: string;
  name: string | null;
  bio: string | null;
  avatar_url: string | null;
  github_id: string;
  github_username: string | null;
  github_profile_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  skills: string[];
  technologies: string[];
  developer_role: DeveloperRole | null;
  experience_level: ExperienceLevel | null;
  interests: string[];
  intent: ContributorIntent | null;
  onboarding_completed: boolean;
  github_access_token_encrypted: string | null;
  github_access_token_expires_at: string | null;
  github_refresh_token_encrypted: string | null;
  github_refresh_token_expires_at: string | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  last_used_at: string;
  user_agent: string | null;
}

/** One day's contribution count from GitHub's contribution calendar. */
export interface ContributionDay {
  date: string; // YYYY-MM-DD, UTC
  count: number;
  /**
   * Whether `date` actually falls within the requested `month`. Every
   * week is always a full Sunday-start 7-day row (see
   * devtunnelActivity.ts / clipToMonth in routes/contributions.ts) so
   * `days[i]`'s weekday is always predictable — but the first/last week
   * of a month legitimately spans into the adjacent month. Those spill-
   * over days are kept as real placeholders (so the grid's row-per-
   * weekday alignment never shifts) but flagged `inMonth: false` so the
   * frontend can render them as empty cells instead of showing a count
   * that isn't part of the month being viewed.
   */
  inMonth: boolean;
}

export interface ContributionWeek {
  days: ContributionDay[];
}

/**
 * Cached/returned shape for a single month's calendar. Shared by both
 * the GitHub calendar (src/lib/githubGraphql.ts) and the DevTunnel-native
 * calendar (src/lib/devtunnelActivity.ts) — same grid shape, different
 * data source.
 */
export interface ContributionCalendar {
  totalContributions: number;
  weeks: ContributionWeek[];
}

/**
 * DevTunnel-native profile stats — projects created/maintained, tasks
 * completed, pull requests merged, all backed by real tables
 * (sql/004_add_devtunnel_contributions.sql). See db/devtunnelStats.ts.
 */
export interface DevTunnelStats {
  projectsCreated: number;
  projectsMaintaining: number;
  tasksCompleted: number;
  pullRequestsMerged: number;
  isMaintainer: boolean;
}

/* -------------------------------------------------------------------------
 * Admin — Project Onboarding (admin_workflow.txt section 6; sql/006).
 *
 * Every interface below is written to match, field-for-field, the already
 * shipped frontend contract in
 * devtunnel-frontend/src/lib/admin/project-onboarding/types.ts — that file
 * is treated as the source of truth for shape/naming so the wizard the
 * frontend already implements works against this backend without any
 * frontend change.
 * ---------------------------------------------------------------------- */

/** A GitHub identity as returned for a repository author or contributor. */
export interface OnboardingGithubIdentity {
  username: string;
  name: string | null;
  avatarUrl: string | null;
  profileUrl: string;
}

/** Step 1 result — everything GitHub supplied for the imported repository. */
export interface OnboardingRepository {
  url: string;
  owner: string;
  name: string;
  fullName: string;
  githubDescription: string | null;
  readme: string | null;
  defaultBranch: string;
  primaryLanguage: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  author: OnboardingGithubIdentity;
  contributors: OnboardingGithubIdentity[];
  hasGithubAppAccess: boolean;
}

export type DescriptionChoice = "EXISTING" | "CUSTOM";

export interface OnboardingDescription {
  choice: DescriptionChoice;
  customDescription: string | null;
}

/**
 * Step 3 — detected/curated tech stack. Every array defaults to `[]` (never
 * a fabricated guess — Backend_Development_Rules.txt rule 37/38).
 */
export interface OnboardingTechStack {
  languages: string[];
  frontend: string[];
  backend: string[];
  frameworks: string[];
  databases: string[];
  libraries: string[];
  buildTools: string[];
  packageManager: string | null;
}

/** Backend-authoritative completion flags (section 24). */
export interface ProjectOnboardingStepState {
  repositoryCompleted: boolean;
  descriptionCompleted: boolean;
  techStackCompleted: boolean;
  previewCompleted: boolean;
  validationCompleted: boolean;
}

/** The onboarding draft as returned to the admin frontend. */
export interface ProjectOnboardingDraft {
  id: string;
  repository: OnboardingRepository | null;
  description: OnboardingDescription | null;
  techStack: OnboardingTechStack | null;
  steps: ProjectOnboardingStepState;
}

export interface ProjectOnboardingValidationIssue {
  step: keyof ProjectOnboardingStepState;
  message: string;
}

export interface ProjectOnboardingValidationResult {
  valid: boolean;
  issues: ProjectOnboardingValidationIssue[];
}

/** Result of `POST /admin/projects/onboarding/:id/complete`. */
export interface CreatedProject {
  id: string;
  slug: string;
  name: string;
}

/**
 * Full row shape as stored in `devtunnel.project_onboarding_drafts`
 * (sql/006). `github_author`/`github_contributors`/`tech_stack` are jsonb
 * columns holding the shapes above — validated on the way out by
 * src/db/projectOnboarding.ts, never trusted blindly (rule 73: validate
 * database results).
 */
export interface ProjectOnboardingDraftRow {
  id: string;
  admin_id: string;

  repository_url: string | null;
  github_owner: string | null;
  github_repo_name: string | null;
  github_full_name: string | null;
  github_description: string | null;
  readme: string | null;
  default_branch: string | null;
  primary_language: string | null;
  stars: number | null;
  forks: number | null;
  open_issues: number | null;
  github_author: OnboardingGithubIdentity | null;
  github_contributors: OnboardingGithubIdentity[] | null;
  has_github_app_access: boolean;
  repository_completed: boolean;

  description_choice: DescriptionChoice | null;
  custom_description: string | null;
  description_completed: boolean;

  tech_stack: OnboardingTechStack | null;
  tech_stack_completed: boolean;

  preview_completed: boolean;
  validation_completed: boolean;

  completed_project_id: string | null;
  completed_at: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * Public-safe subset of `devtunnel.projects` used by the onboarding
 * completion response. The full admin project-listing/detail row shape
 * (section 4/18) is intentionally out of scope of this file — this is
 * only what `complete_project_onboarding()` (sql/006) returns.
 */
export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
}

/* -------------------------------------------------------------------------
 * Admin — Projects List (admin_workflow.txt section 4 — "Projects Page";
 * section 22 — Admin Backend API Map: `GET /admin/projects`,
 * `GET /admin/projects/:id`).
 *
 * Field-for-field match with the already-shipped frontend contract in
 * devtunnel-frontend/src/lib/admin/projects/types.ts — that file is the
 * source of truth for shape/naming here, same convention as the Project
 * Onboarding types above.
 * ---------------------------------------------------------------------- */

/** Minimal GitHub identity for the table's "Author" column (section 4/26). */
export interface AdminProjectAuthor {
  username: string;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * Only `ACTIVE` is ever produced today (a project only ever comes into
 * existence already active — section 24/`complete_project_onboarding`,
 * sql/006). `ARCHIVED` is kept only as an honest fallback for a future
 * archive/suspend flow the enum already reserves room for
 * (`devtunnel.project_status`, sql/006) — never a status this backend
 * invents on its own.
 */
export type AdminProjectStatus = "ACTIVE" | "ARCHIVED";

/**
 * A single row of the Admin Projects table (section 4 ▸ Frontend):
 * "Project Name, GitHub Repository, Author, DevTunnel Contributors,
 * GitHub Contributors, Task Count, Status".
 *
 * `devTunnelContributorCount` and `githubContributorCount` are kept as two
 * separate fields, never summed or merged — section 5 is explicit that
 * "GitHub Contributors ≠ DevTunnel Contributors" and "Do not mix the two
 * datasets."
 */
export interface AdminProjectSummary {
  id: string;
  slug: string;
  name: string;
  repositoryUrl: string;
  repositoryFullName: string;
  author: AdminProjectAuthor;
  devTunnelContributorCount: number;
  githubContributorCount: number;
  taskCount: number;
  status: AdminProjectStatus;
}

/**
 * Raw row shape as returned by `devtunnel.admin_project_list`
 * (sql/007_add_admin_project_list.sql) — a read-only view over
 * `devtunnel.projects` joined with per-project task/contributor
 * aggregates. Never selected with `select("*")` (rule 23) — see the
 * explicit column list in src/db/adminProjects.ts.
 */
export interface AdminProjectListRow {
  id: string;
  slug: string;
  name: string;
  repo_url: string | null;
  github_full_name: string | null;
  github_owner: string | null;
  github_author: OnboardingGithubIdentity | null;
  status: AdminProjectStatus;
  created_at: string;
  github_contributor_count: number;
  task_count: number;
  devtunnel_contributor_count: number;
}

/**
 * `GET /admin/projects/:id` response (admin_workflow.txt section 18 —
 * "Project Detail Page"; section 22). Field-for-field match with the
 * already-shipped frontend contract in
 * devtunnel-frontend/src/lib/admin/projects/types.ts — that file names
 * this exact shape (`AdminProjectDetail extends AdminProjectSummary`) and
 * is the reason `getAdminProjectById`/`AdminProjectSummary` alone are not
 * enough for this route: the detail page (page.tsx) renders
 * `project.githubDescription`, `project.readme`, and
 * `project.openIssuesCount`, none of which the list-row summary carries.
 *
 * `githubDescription`/`readme`/`openIssuesCount` all come straight off
 * `devtunnel.projects` (sql/006 — `github_description`, `readme`,
 * `open_issues`), captured once at onboarding time (Project Onboarding
 * Step 1) — never re-fetched from GitHub on every detail-page view.
 */
export interface AdminProjectDetail extends AdminProjectSummary {
  /** GitHub's own repository description, or `null` if GitHub has none set. */
  githubDescription: string | null;
  /** Full README content as imported from the repository's default branch. */
  readme: string | null;
  /** Open issue count on GitHub for this repository (not a DevTunnel task count). */
  openIssuesCount: number;
}

/**
 * Raw row shape for the extra columns `AdminProjectDetail` needs beyond
 * `AdminProjectListRow` — selected directly from `devtunnel.projects`
 * (the base table, not the `admin_project_list` view; see
 * src/db/adminProjects.ts `getAdminProjectDetailById`).
 */
export interface AdminProjectDetailExtraRow {
  github_description: string | null;
  readme: string | null;
  open_issues: number;
}

/**
 * Response body of `DELETE /admin/projects/:id` (sql/008 —
 * `devtunnel.delete_admin_project`). The project is soft-deleted, never
 * physically removed (rule 86 — see sql/008's header comment), so this
 * confirms the deletion happened and when, rather than returning nothing.
 */
export interface DeleteAdminProjectResult {
  id: string;
  slug: string;
  name: string;
  deletedAt: string;
}