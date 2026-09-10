// devtunnel-backend/src/types.ts

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
  /**
   * Curated tech stack, surfaced on the list row (not just
   * `AdminProjectDetail`) so `/admin/projects` can filter by it without
   * a second per-project fetch. `null` when nothing has been recorded
   * yet (sql/015_fix_admin_project_list_task_count.sql).
   */
  techStack: OnboardingTechStack | null;
}

/**
 * Raw row shape as returned by `devtunnel.admin_project_list`
 * (sql/015_fix_admin_project_list_task_count.sql — see that file's
 * header for why the view is redefined there instead of in 007) — a
 * read-only view over `devtunnel.projects` joined with per-project
 * task/contributor aggregates. Never selected with `select("*")`
 * (rule 23) — see the explicit column list in src/db/adminProjects.ts.
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
  /** Raw jsonb — normalize with `toOnboardingTechStackOrNull` before use, same as `ProjectTechStackRow.tech_stack`. */
  tech_stack: unknown;
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
 *
 * `description`/`techStack` mirror the same onboarding-time choices
 * captured for Project Onboarding Steps 2–3 (`description_source` /
 * `custom_description` / `tech_stack`, sql/006), surfaced here so
 * `PATCH /admin/projects/:id` (via `updateAdminProject`) has something to
 * diff/recompute against and the detail page's edit panel can pre-fill
 * both fields.
 */
export interface AdminProjectDetail extends AdminProjectSummary {
  /** GitHub's own repository description, or `null` if GitHub has none set. */
  githubDescription: string | null;
  /** Full README content as imported from the repository's default branch. */
  readme: string | null;
  /** Open issue count on GitHub for this repository (not a DevTunnel task count). */
  openIssuesCount: number;
  /** The admin's description choice for this project, or `null` if never set. */
  description: OnboardingDescription | null;
  /** The project's curated tech stack, or `null` if none has been recorded. */
  techStack: OnboardingTechStack | null;
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
  description_source: DescriptionChoice | null;
  custom_description: string | null;
  tech_stack: unknown;
}

/**
 * Validated payload for `PATCH /admin/projects/:id` — the two fields
 * Project Onboarding's Step 2 (Description) and Step 3 (Tech Stack)
 * already hand the Admin control over. See
 * src/db/adminProjects.ts `updateAdminProject` for why every other
 * GitHub-sourced field has no writable path here.
 */
export interface AdminProjectUpdatePayload {
  description?: OnboardingDescription;
  techStack?: OnboardingTechStack;
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

/* -------------------------------------------------------------------------
 * Admin — Task Onboarding (admin_workflow.txt section 10 — "Create Task —
 * Task Onboarding"; section 25 — "Task Onboarding State"; sql/009,
 * sql/010, sql/011, sql/012).
 *
 * Every interface below is written to match, field-for-field, the already
 * shipped frontend contract in
 * devtunnel-frontend/src/lib/admin/task-onboarding/types.ts — same
 * convention as the Project Onboarding types above. All 7 steps (Project
 * Selection, Select Existing Issue, Issue Information, Fetch Project Tech
 * Stack, Difficulty, Issue Preview, Final Validation) plus completion are
 * backed by real data.
 * ---------------------------------------------------------------------- */

/**
 * The minimal GitHub coordinates needed to call the GitHub REST API for a
 * given DevTunnel project — backs `GET /admin/projects/:id/github/issues`
 * (admin_workflow.txt section 10 ▸ Step 2 — "Select Existing Issue") and
 * Task Onboarding's own issue-selection routes
 * (src/routes/taskOnboarding.ts), both of which need `{ owner, repo }` to
 * call src/lib/githubRepo.ts's issue endpoints but must never re-derive it
 * from a client-supplied string (rule 15: never trust frontend input for
 * something the backend already recorded at Project Onboarding time).
 * Sourced from `devtunnel.projects.github_owner` /
 * `devtunnel.projects.github_full_name`, captured once during Project
 * Onboarding Step 1 (sql/006) — see
 * src/db/adminProjects.ts `getProjectGithubRepoRef`.
 */
export interface AdminProjectGithubRepoRef {
  owner: string;
  repo: string;
}

/**
 * Step 1 — "Project Selection" list option. Deliberately a small,
 * list-friendly shape — not the full `AdminProjectSummary` table row —
 * matching the frontend's own `TaskOnboardingProjectOption`.
 */
export interface TaskOnboardingProjectOption {
  id: string;
  slug: string;
  name: string;
  repositoryFullName: string;
  primaryLanguage: string | null;
}

/**
 * Raw row shape for the columns `listEligibleTaskOnboardingProjects` /
 * `getEligibleTaskOnboardingProject` / `getTaskOnboardingProjectById`
 * select directly from `devtunnel.projects` (never `select("*")` — rule
 * 23).
 */
export interface TaskOnboardingProjectEligibilityRow {
  id: string;
  slug: string;
  name: string;
  github_full_name: string | null;
  primary_language: string | null;
}

export type GithubIssueState = "OPEN" | "CLOSED";

/**
 * Step 2/3 result shape — a snapshot of a single GitHub issue, taken at
 * selection time by `PATCH /admin/tasks/onboarding/:id/issue`
 * (src/routes/taskOnboarding.ts) and persisted verbatim on
 * `devtunnel.task_onboarding_drafts.github_issue` (sql/010). Also backs
 * the list returned by `GET /admin/projects/:id/github/issues`
 * (Step 2's "Fetch GitHub Issues" — src/lib/githubRepo.ts
 * `fetchRepositoryIssues`).
 */
export interface GithubIssueSummary {
  number: number;
  title: string;
  state: GithubIssueState;
  url: string;
  labels: string[];
  author: OnboardingGithubIdentity;
  body: string | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export type IssueInformationChoice = "EXISTING" | "CUSTOM";

/**
 * Step 3 result shape — the Admin's choice between "Use Existing Issue
 * Information" and "Use Existing Issue Information + Custom Information"
 * (admin_workflow.txt section 10 ▸ Step 3). Written by
 * `PATCH /admin/tasks/onboarding/:id/issue-information`. `customDescription`
 * is DevTunnel-only metadata layered on top of (never a rewrite of) the
 * selected `GithubIssueSummary.body` — "The custom information belongs to
 * DevTunnel" (section 10) — and is always `null` when `choice` is
 * `"EXISTING"`.
 */
export interface TaskIssueInformation {
  choice: IssueInformationChoice;
  customDescription: string | null;
}

/**
 * Step 5 result shape — the Admin's role + difficulty curation for this
 * task (admin_workflow.txt section 10 ▸ Step 5 — "Difficulty"). Reuses
 * `DeveloperRole` / `ExperienceLevel` verbatim (see
 * src/routes/taskOnboarding.ts `curationSchema`) rather than a second
 * vocabulary — "Use the exact difficulty values already defined by the
 * current source/schema if they exist."
 */
export interface TaskCuration {
  role: DeveloperRole | null;
  difficulty: ExperienceLevel | null;
}

/**
 * Backend-authoritative completion flags (section 25 — "Task Onboarding
 * State"). Field names follow the spec's own list verbatim. All seven
 * flags are backed by real data — the frontend wizard reads these on
 * every draft response to decide what it's allowed to do next, never a
 * locally-computed guess (rule 24 equivalent: backend is the sole
 * authority on completion state).
 */
export interface TaskOnboardingStepState {
  projectSelected: boolean;
  issueSelected: boolean;
  issueInformationCompleted: boolean;
  techStackLoaded: boolean;
  difficultyDefined: boolean;
  previewCompleted: boolean;
  validationCompleted: boolean;
}

/** The task onboarding draft as returned to the admin frontend. */
export interface TaskOnboardingDraft {
  id: string;
  project: TaskOnboardingProjectOption | null;
  issue: GithubIssueSummary | null;
  issueInformation: TaskIssueInformation | null;
  curation: TaskCuration | null;
  techStack: OnboardingTechStack | null;
  steps: TaskOnboardingStepState;
}

/**
 * Full row shape as stored in `devtunnel.task_onboarding_drafts`
 * (sql/009, extended by sql/010 for Steps 2–3, sql/011 for Steps 4–5, and
 * sql/012 for Steps 6–7).
 */
export interface TaskOnboardingDraftRow {
  id: string;
  admin_id: string;

  project_id: string;
  project_selected: boolean;

  // Step 2 — Select Existing Issue (sql/010)
  issue_number: number | null;
  github_issue: GithubIssueSummary | null;
  issue_selected: boolean;

  // Step 3 — Issue Information (sql/010)
  issue_information_choice: IssueInformationChoice | null;
  custom_description: string | null;
  issue_information_completed: boolean;

  // Step 4 — Fetch Project Tech Stack (sql/011)
  tech_stack: OnboardingTechStack | null;
  tech_stack_loaded: boolean;

  // Step 5 — Difficulty (sql/011)
  curation_role: DeveloperRole | null;
  curation_difficulty: ExperienceLevel | null;
  difficulty_defined: boolean;

  // Step 6 — Issue Preview (sql/012)
  preview_completed: boolean;

  // Step 7 — Final Validation (sql/012)
  validation_completed: boolean;

  completed_task_id: string | null;
  completed_at: string | null;

  created_at: string;
  updated_at: string;
}

/** A single unmet-requirement message from `POST .../:id/validate`. */
export interface TaskOnboardingValidationIssue {
  step: keyof TaskOnboardingStepState;
  message: string;
}

export interface TaskOnboardingValidationResult {
  valid: boolean;
  issues: TaskOnboardingValidationIssue[];
}

/** Result of `POST /admin/tasks/onboarding/:id/complete`. */
export interface CreatedTask {
  id: string;
  slug: string;
  title: string;
  projectSlug: string;
}

/* -------------------------------------------------------------------------
 * Admin — Tasks (admin_workflow.txt section 8 — "Task Section"; section
 * 13 — "Task Page"; section 14 — "People Doing Tasks"; section 15 —
 * "Deleted DevTunnel Tasks / Issues"; section 22 — Admin Backend API Map,
 * "Tasks": `GET /admin/tasks`, `GET /admin/tasks/:id`,
 * `PATCH /admin/tasks/:id`, `DELETE /admin/tasks/:id`; sql/013).
 *
 * Every interface below is written to match, field-for-field, the already
 * shipped frontend contract in devtunnel-frontend/src/lib/admin/tasks/
 * types.ts — that file is treated as the source of truth for shape/naming,
 * same convention as the Project/Task Onboarding types above.
 * ---------------------------------------------------------------------- */

/** `devtunnel.task_status` (sql/004) — the task's own DevTunnel lifecycle. */
export type AdminTaskStatus = "OPEN" | "IN_PROGRESS" | "DONE";

/**
 * The project a task belongs to, trimmed to exactly what the Tasks table
 * and filter bar need — not the full `AdminProjectSummary` row (section
 * 26: "DevTunnel Task" hangs off "DevTunnel Project", not the other way
 * around).
 */
export interface AdminTaskProjectRef {
  id: string;
  slug: string;
  name: string;
  repositoryFullName: string;
  repositoryUrl: string;
  author: AdminProjectAuthor;
}

/**
 * The GitHub issue a task was onboarded from — a read-only reference
 * built from the task's own `github_issue_snapshot` (sql/012, taken at
 * Task Onboarding Step 2/3 selection time). "Do not modify the original
 * GitHub issue" (section 10) applies here too.
 */
export interface AdminTaskGithubIssueRef {
  number: number;
  title: string;
  url: string;
  state: GithubIssueState;
  author: OnboardingGithubIdentity;
}

/**
 * A single row of the Tasks table (section 13 ▸ Frontend) plus the
 * section 14 contributor breakdown. `activeContributorCount` /
 * `completedContributorCount` are derived from `status` + `assignee_id`
 * (0 or 1 — this schema has no multi-contributor table, and rule 38
 * forbids fabricating one); `submissionCount` is a real count of
 * `devtunnel.pull_requests` rows for this task (see
 * `devtunnel.admin_task_list`, sql/013).
 *
 * `techStack` is the flattened tag list the task inherits from its
 * project's already-validated tech stack — same flattening
 * `TaskPreviewStep` already does for the onboarding preview (languages,
 * frontend, backend, frameworks, databases, libraries, buildTools, in
 * that order) — a task has no tech stack of its own.
 *
 * `deletedAt` is `null` for every task that still exists in DevTunnel.
 * Non-null marks a soft-deleted task whose GitHub issue still exists
 * (section 15).
 */
export interface AdminTaskSummary {
  id: string;
  slug: string | null;
  title: string;
  project: AdminTaskProjectRef;
  githubIssue: AdminTaskGithubIssueRef | null;
  role: DeveloperRole | null;
  difficulty: ExperienceLevel | null;
  techStack: string[];
  status: AdminTaskStatus;
  activeContributorCount: number;
  completedContributorCount: number;
  submissionCount: number;
  deletedAt: string | null;
}

/**
 * `GET /admin/tasks/:id` (section 22; A14 — "Task Details"). Extends the
 * list-row summary with the task's full curated description — the same
 * "existing GitHub issue vs. existing + custom" choice Task Onboarding's
 * Step 3 already models, read back for an already-created task.
 */
export interface AdminTaskDetail extends AdminTaskSummary {
  /** Only set when the task was onboarded/edited with a DevTunnel-specific description layered on the issue. */
  customDescription: string | null;
  /** The original GitHub issue body, exactly as imported — never rewritten. */
  githubIssueBody: string | null;
}

/**
 * Raw row shape as returned by `devtunnel.admin_task_list` (sql/013) — a
 * read-only view over `devtunnel.tasks` joined with its project and a
 * real submission count. Never selected with `select("*")` (rule 23) —
 * see the explicit column list in src/db/adminTasks.ts.
 */
export interface AdminTaskListRow {
  id: string;
  slug: string | null;
  title: string;
  status: AdminTaskStatus;
  role: DeveloperRole | null;
  difficulty: ExperienceLevel | null;
  assignee_id: string | null;
  github_issue_number: number | null;
  github_issue_url: string | null;
  github_issue_snapshot: GithubIssueSummary | null;
  custom_description: string | null;
  deleted_at: string | null;
  created_at: string;
  project_id: string;
  project_slug: string;
  project_name: string;
  project_repo_url: string | null;
  project_github_full_name: string | null;
  project_github_author: OnboardingGithubIdentity | null;
  project_github_owner: string | null;
  project_tech_stack: OnboardingTechStack | null;
  submission_count: number;
}

/**
 * Validated payload for `PATCH /admin/tasks/:id` — deliberately limited
 * to the fields Task Onboarding itself hands the Admin curation control
 * over (role, difficulty, the custom description layered on the GitHub
 * issue) plus the task's own DevTunnel `status`. Project, GitHub issue,
 * contributors, and submission counts are derived/GitHub-sourced and have
 * no writable counterpart here — same restriction `AdminProjectUpdatePayload`
 * applies to projects.
 */
export interface AdminTaskUpdatePayload {
  role?: DeveloperRole;
  difficulty?: ExperienceLevel;
  customDescription?: string | null;
  status?: AdminTaskStatus;
}

/**
 * Response body of `DELETE /admin/tasks/:id` (sql/013 —
 * `devtunnel.delete_admin_task`). The task is soft-deleted, never
 * physically removed (section 15), so this confirms the deletion
 * happened and when, rather than returning nothing.
 */
export interface DeleteAdminTaskResult {
  id: string;
  slug: string | null;
  title: string;
  deletedAt: string;
}

/* -------------------------------------------------------------------------
 * Admin — New Issues (admin_workflow.txt section 9 — "DevTunnel Task
 * Lifecycle"; section 16 — "New Issues Section"; section 17 — "New Issues
 * Flow"; section 22 — Admin Backend API Map: `GET /admin/new-issues`,
 * `POST /admin/new-issues/:id/ignore`; sql/014).
 *
 * Every interface below is written to match, field-for-field, the already
 * shipped frontend contract in
 * devtunnel-frontend/src/lib/admin/new-issues/types.ts — same convention
 * as the Project/Task Onboarding and Admin Tasks types above.
 * ---------------------------------------------------------------------- */

/**
 * A project's resolved GitHub coordinates plus everything the New Issues
 * table/filter bar needs (section 16 ▸ Frontend). `techStack` is the
 * project's own already-validated tech stack, flattened the same way
 * `AdminTaskSummary.techStack` is for onboarded tasks — a GitHub issue has
 * no tech stack of its own.
 */
export interface AdminNewIssueProjectRef {
  id: string;
  slug: string;
  name: string;
  repositoryFullName: string;
  repositoryUrl: string;
  techStack: string[];
  onboardedAt: string;
}

/**
 * A single row of `GET /admin/new-issues`'s response (section 16 ▸
 * Frontend column list: "Issue #, Issue Title, Project, GitHub Author,
 * Labels, Created, Updated").
 *
 * `id` is the composite `{projectId}:{githubIssueNumber}` key
 * (`ignoredIssueKey`, src/db/adminNewIssues.ts) — deliberately not a task
 * id, since no task exists yet for a New Issue.
 *
 * `state` is kept even though the column list above doesn't name it
 * explicitly: an issue can be closed on GitHub before an admin acts on
 * it, and offering "Create Task" for an already-closed issue would
 * curate a task for something no longer actionable.
 */
export interface AdminNewIssue {
  id: string;
  number: number;
  title: string;
  url: string;
  state: GithubIssueState;
  project: AdminNewIssueProjectRef;
  /** The GitHub user who opened the issue — the "GitHub Author" column. */
  author: OnboardingGithubIdentity;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// INSERT INTO: devtunnel-backend/src/types.ts
// WHERE: immediately after the `CreatedProject` interface (ends the
//        "Admin — Project Onboarding" section, line ~301) and before
//        `ProjectOnboardingDraftRow` — i.e. as its own new section right
//        after the project-onboarding block ends at line 345 in the
//        current file. Paste the whole block below there.
// ============================================================================

/* ----------------------------------------------------------------------
 * Admin — Open Source Tool Onboarding (`/admin/opensource-tools/new`).
 *
 * There's no admin_workflow.txt section for this flow — it isn't part of
 * the documented Admin Portal spec. Every interface below is written to
 * match, field-for-field, the already-shipped frontend contract in
 * devtunnel-frontend/src/lib/admin/opensource-tool-onboarding/types.ts —
 * that file is treated as the source of truth for shape/naming, the same
 * "frontend-as-source-of-truth" approach its own header documents.
 *
 * `DescriptionChoice` (EXISTING/CUSTOM, declared above for Project
 * Onboarding) is reused as-is here rather than declaring a second,
 * identical union — same reuse decision sql/017 makes for the Postgres
 * enum behind it.
 * ---------------------------------------------------------------------- */

/** Step 1 result — everything resolved from the Admin-supplied tool URL. */
export interface OnboardingToolSource {
  url: string;
  name: string;
  /** Short description exactly as fetched, or `null` if none was found. */
  fetchedDescription: string | null;
  /** Full README/long-form content when the URL resolved to a GitHub repository, else `null`. */
  readme: string | null;
  primaryLanguage: string | null;
}

export interface OnboardingToolDescription {
  choice: DescriptionChoice;
  /** Only meaningful when `choice === "CUSTOM"`. */
  customDescription: string | null;
}

/** Step 3 — free-form audience labels (roles, fields, ...). Not a fixed enum — the set isn't closed. */
export interface OnboardingToolLabels {
  values: string[];
}

/** Step 4 — Admin-authored Markdown. Never derived from `source.readme` (see that field's comment above). */
export interface OnboardingToolSetupGuide {
  content: string;
}

/** Backend-authoritative completion flags returned to the frontend wizard. */
export interface ToolOnboardingStepState {
  urlCompleted: boolean;
  descriptionCompleted: boolean;
  labelsCompleted: boolean;
  setupGuideCompleted: boolean;
  previewCompleted: boolean;
}

/** The onboarding draft as returned to the admin frontend. */
export interface ToolOnboardingDraft {
  id: string;
  source: OnboardingToolSource | null;
  description: OnboardingToolDescription | null;
  labels: OnboardingToolLabels | null;
  setupGuide: OnboardingToolSetupGuide | null;
  steps: ToolOnboardingStepState;
}

export interface ToolOnboardingValidationIssue {
  step: keyof ToolOnboardingStepState;
  message: string;
}

export interface ToolOnboardingValidationResult {
  valid: boolean;
  issues: ToolOnboardingValidationIssue[];
}

/** Result of `POST /admin/opensource-tools/onboarding/:id/complete`. */
export interface CreatedOpenSourceTool {
  id: string;
  slug: string;
  name: string;
}

/**
 * Full row shape as stored in `devtunnel.opensource_tool_onboarding_drafts`
 * (sql/017). `labels` is a jsonb column holding a plain `string[]` —
 * validated on the way out by src/db/opensourceToolOnboarding.ts, never
 * trusted blindly (rule 73: validate database results).
 *
 * Note `validation_completed` has no counterpart in
 * `ToolOnboardingStepState` above — it's an internal gate for
 * `/complete`, the same role it plays in `ProjectOnboardingDraftRow`,
 * just not one of the five steps this wizard surfaces back to the Admin.
 */
export interface OpenSourceToolOnboardingDraftRow {
  id: string;
  admin_id: string;

  source_url: string | null;
  source_name: string | null;
  source_fetched_description: string | null;
  source_readme: string | null;
  source_primary_language: string | null;
  url_completed: boolean;

  description_choice: DescriptionChoice | null;
  custom_description: string | null;
  description_completed: boolean;

  labels: string[] | null;
  labels_completed: boolean;

  setup_guide_content: string;
  setup_guide_completed: boolean;

  preview_completed: boolean;
  validation_completed: boolean;

  completed_tool_id: string | null;
  completed_at: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * Full row shape as stored in `devtunnel.opensource_tools` (sql/017) —
 * the published catalog table. Not yet consumed outside the onboarding
 * completion path; declared now so src/db/opensourceToolOnboarding.ts
 * (Step 4/5 of this build) has a typed return value for
 * `complete_opensource_tool_onboarding` instead of an inline shape.
 */
export interface OpenSourceToolRow {
  id: string;
  slug: string;
  name: string;
  source_url: string;
  fetched_description: string | null;
  readme: string | null;
  primary_language: string | null;
  description_source: DescriptionChoice;
  custom_description: string | null;
  labels: string[];
  setup_guide: string;
  created_by: string;
  onboarding_draft_id: string | null;
  created_at: string;
  updated_at: string;
}
