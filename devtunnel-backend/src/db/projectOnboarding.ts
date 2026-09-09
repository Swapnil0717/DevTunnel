import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreatedProject,
  DescriptionChoice,
  OnboardingGithubIdentity,
  OnboardingTechStack,
  ProjectOnboardingDraft,
  ProjectOnboardingDraftRow,
  ProjectOnboardingValidationIssue,
  ProjectOnboardingValidationResult,
} from "../types";

/** Explicit column list — never `select("*")` (Backend_Development_Rules.txt rule 23). */
const DRAFT_COLUMNS =
  "id, admin_id, repository_url, github_owner, github_repo_name, github_full_name, " +
  "github_description, readme, default_branch, primary_language, stars, forks, open_issues, " +
  "github_author, github_contributors, has_github_app_access, repository_completed, " +
  "description_choice, custom_description, description_completed, " +
  "tech_stack, tech_stack_completed, preview_completed, validation_completed, " +
  "completed_project_id, completed_at, created_at, updated_at";

/**
 * Errors this module raises for onboarding-specific business rules, kept
 * distinct from a generic thrown `Error` so route handlers
 * (src/routes/admin/projectOnboarding.ts) can map each one to the correct
 * HTTP status without string-matching a message (rule 20: centralized,
 * predictable error handling).
 */
export class ProjectOnboardingError extends Error {
  code:
    | "not_found"
    | "already_completed"
    | "step_incomplete"
    | "repository_already_onboarded"
    | "conflict";
  constructor(code: ProjectOnboardingError["code"], message: string) {
    super(message);
    this.name = "ProjectOnboardingError";
    this.code = code;
  }
}

/**
 * Maps a raw `devtunnel.project_onboarding_drafts` row to the frontend-
 * facing `ProjectOnboardingDraft` shape (devtunnel-frontend/src/lib/admin/
 * project-onboarding/types.ts). `admin_id` and every other internal-only
 * column are deliberately never included in the returned object (rule 9:
 * separate public/private data — here, "public" means "visible to the
 * owning admin", still narrower than the full row).
 */
export function toOnboardingDraft(row: ProjectOnboardingDraftRow): ProjectOnboardingDraft {
  const hasRepository = row.github_full_name !== null && row.github_owner !== null && row.github_repo_name !== null;

  return {
    id: row.id,
    repository: hasRepository
      ? {
          url: row.repository_url ?? "",
          owner: row.github_owner as string,
          name: row.github_repo_name as string,
          fullName: row.github_full_name as string,
          githubDescription: row.github_description,
          readme: row.readme,
          defaultBranch: row.default_branch ?? "main",
          primaryLanguage: row.primary_language,
          stars: row.stars ?? 0,
          forks: row.forks ?? 0,
          openIssues: row.open_issues ?? 0,
          author: (row.github_author as OnboardingGithubIdentity | null) ?? {
            username: row.github_owner as string,
            name: null,
            avatarUrl: null,
            profileUrl: `https://github.com/${row.github_owner}`,
          },
          contributors: (row.github_contributors as OnboardingGithubIdentity[] | null) ?? [],
          hasGithubAppAccess: row.has_github_app_access,
        }
      : null,
    description:
      row.description_choice !== null
        ? { choice: row.description_choice, customDescription: row.custom_description }
        : null,
    techStack: (row.tech_stack as OnboardingTechStack | null) ?? null,
    steps: {
      repositoryCompleted: row.repository_completed,
      descriptionCompleted: row.description_completed,
      techStackCompleted: row.tech_stack_completed,
      previewCompleted: row.preview_completed,
      validationCompleted: row.validation_completed,
    },
  };
}

/**
 * Loads a draft, scoped to the requesting admin (`admin_id = adminId`).
 * Returns `null` for both "doesn't exist" and "belongs to a different
 * admin" — indistinguishable to the caller, which is deliberate (rule 13:
 * prevent IDOR — never reveal that a resource exists for someone else).
 */
export async function getDraftForAdmin(
  supabase: SupabaseClient,
  draftId: string,
  adminId: string,
): Promise<ProjectOnboardingDraftRow | null> {
  const { data, error } = await supabase
    .from("project_onboarding_drafts")
    .select(DRAFT_COLUMNS)
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .maybeSingle<ProjectOnboardingDraftRow>();

  if (error) throw new Error(`Failed to load onboarding draft: ${error.message}`);
  return data;
}

async function requireDraft(
  supabase: SupabaseClient,
  draftId: string,
  adminId: string,
): Promise<ProjectOnboardingDraftRow> {
  const draft = await getDraftForAdmin(supabase, draftId, adminId);
  if (!draft) {
    throw new ProjectOnboardingError("not_found", "Onboarding draft not found");
  }
  if (draft.completed_project_id) {
    throw new ProjectOnboardingError(
      "already_completed",
      "This onboarding draft has already been completed and can no longer be edited",
    );
  }
  return draft;
}

/**
 * Early duplicate check for Step 1 (`saveRepositoryImport` below).
 * `complete_project_onboarding` (sql/006/008) is the real, race-safe
 * guard against onboarding the same GitHub repository twice — this is
 * purely a fast-fail so an admin who imports an already-onboarded
 * repository finds out immediately, instead of clicking through all five
 * remaining wizard steps only to hit `REPOSITORY_ALREADY_ONBOARDED` on
 * the final "Create Project" click. Excludes soft-deleted projects, same
 * as the partial unique index (`projects_github_full_name_key`, sql/008)
 * — a deleted project's repository is available for re-onboarding.
 */
async function isRepositoryAlreadyOnboarded(
  supabase: SupabaseClient,
  githubFullName: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("github_full_name", githubFullName)
    .is("deleted_at", null)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(`Failed to check for an already-onboarded repository: ${error.message}`);
  return data !== null;
}

export interface RepositoryImportInput {
  repositoryUrl: string;
  owner: string;
  repoName: string;
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

/**
 * Step 1 write. Creates a new draft when `draftId` is omitted, or
 * re-imports into an existing (not-yet-completed) draft owned by this
 * admin — re-running Step 1 always resets Steps 2–5's completion flags
 * (but not their stored values) since a different repository invalidates
 * whatever description/tech-stack choices were made against the previous
 * one.
 */
export async function saveRepositoryImport(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string | undefined,
  input: RepositoryImportInput,
): Promise<ProjectOnboardingDraftRow> {
  if (draftId) {
    await requireDraft(supabase, draftId, adminId);
  }

  // Fast-fail duplicate check (see `isRepositoryAlreadyOnboarded` above) —
  // this is a courtesy early error, not the source of truth; the
  // row-locked check inside `complete_project_onboarding` (sql/008) is
  // what actually prevents a race from creating two projects for the
  // same repository.
  if (await isRepositoryAlreadyOnboarded(supabase, input.fullName)) {
    throw new ProjectOnboardingError(
      "repository_already_onboarded",
      "This GitHub repository has already been onboarded as a DevTunnel project",
    );
  }

  const values = {
    admin_id: adminId,
    repository_url: input.repositoryUrl,
    github_owner: input.owner,
    github_repo_name: input.repoName,
    github_full_name: input.fullName,
    github_description: input.githubDescription,
    readme: input.readme,
    default_branch: input.defaultBranch,
    primary_language: input.primaryLanguage,
    stars: input.stars,
    forks: input.forks,
    open_issues: input.openIssues,
    github_author: input.author,
    github_contributors: input.contributors,
    has_github_app_access: input.hasGithubAppAccess,
    repository_completed: input.hasGithubAppAccess,
    // A fresh (or re-run) repository import invalidates anything that was
    // derived from the *previous* repository — never silently carry a
    // stale description/tech-stack/preview/validation state forward.
    description_completed: false,
    tech_stack_completed: false,
    preview_completed: false,
    validation_completed: false,
  };

  const query = draftId
    ? supabase.from("project_onboarding_drafts").update(values).eq("id", draftId).eq("admin_id", adminId)
    : supabase.from("project_onboarding_drafts").insert(values);

  const { data, error } = await query.select(DRAFT_COLUMNS).single<ProjectOnboardingDraftRow>();
  if (error) throw new Error(`Failed to save repository import: ${error.message}`);
  return data;
}

/** Step 2 write. */
export async function saveDescription(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
  choice: DescriptionChoice,
  customDescription: string | null,
): Promise<ProjectOnboardingDraftRow> {
  const draft = await requireDraft(supabase, draftId, adminId);
  if (!draft.repository_completed) {
    throw new ProjectOnboardingError(
      "step_incomplete",
      "Import a GitHub repository before setting the project description",
    );
  }

  const { data, error } = await supabase
    .from("project_onboarding_drafts")
    .update({
      description_choice: choice,
      custom_description: choice === "CUSTOM" ? customDescription : null,
      description_completed: true,
      preview_completed: false,
      validation_completed: false,
    })
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .select(DRAFT_COLUMNS)
    .single<ProjectOnboardingDraftRow>();

  if (error) throw new Error(`Failed to save project description: ${error.message}`);
  return data;
}

/** Step 3 write — either the auto-detected stack or the admin's corrected version. */
export async function saveTechStack(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
  techStack: OnboardingTechStack,
): Promise<ProjectOnboardingDraftRow> {
  const draft = await requireDraft(supabase, draftId, adminId);
  if (!draft.repository_completed) {
    throw new ProjectOnboardingError(
      "step_incomplete",
      "Import a GitHub repository before setting the tech stack",
    );
  }

  const { data, error } = await supabase
    .from("project_onboarding_drafts")
    .update({
      tech_stack: techStack,
      tech_stack_completed: true,
      preview_completed: false,
      validation_completed: false,
    })
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .select(DRAFT_COLUMNS)
    .single<ProjectOnboardingDraftRow>();

  if (error) throw new Error(`Failed to save tech stack: ${error.message}`);
  return data;
}

/**
 * Step 4 checkpoint. `GET .../:id/preview` calls this once it has loaded
 * the draft — marking `preview_completed` only once Steps 1–3 already are,
 * matching the wizard's own linear step order (section 6's flow diagram).
 */
export async function markPreviewCompleted(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
): Promise<ProjectOnboardingDraftRow> {
  const draft = await requireDraft(supabase, draftId, adminId);
  if (!draft.repository_completed || !draft.description_completed || !draft.tech_stack_completed) {
    throw new ProjectOnboardingError(
      "step_incomplete",
      "Complete the repository, description, and tech-stack steps before previewing the project",
    );
  }
  if (draft.preview_completed) return draft;

  const { data, error } = await supabase
    .from("project_onboarding_drafts")
    .update({ preview_completed: true })
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .select(DRAFT_COLUMNS)
    .single<ProjectOnboardingDraftRow>();

  if (error) throw new Error(`Failed to mark preview completed: ${error.message}`);
  return data;
}

/**
 * Step 5 — re-derives validity directly from the draft's actual stored
 * data (never trusts the cached `*_completed` flags alone), matching
 * section 24: the backend is the sole authority on completion state.
 */
export function computeValidation(row: ProjectOnboardingDraftRow): ProjectOnboardingValidationResult {
  const issues: ProjectOnboardingValidationIssue[] = [];

  if (!row.repository_completed || !row.github_full_name) {
    issues.push({ step: "repositoryCompleted", message: "Import a valid, accessible GitHub repository" });
  } else if (!row.has_github_app_access) {
    issues.push({
      step: "repositoryCompleted",
      message: "The connected GitHub account doesn't have access to this repository",
    });
  }

  if (!row.description_completed || !row.description_choice) {
    issues.push({ step: "descriptionCompleted", message: "Choose how the project description should be sourced" });
  } else if (row.description_choice === "CUSTOM" && !row.custom_description?.trim()) {
    issues.push({ step: "descriptionCompleted", message: "Custom description cannot be empty" });
  }

  if (!row.tech_stack_completed || !row.tech_stack) {
    issues.push({ step: "techStackCompleted", message: "Detect or set the project's tech stack" });
  }

  if (!row.preview_completed) {
    issues.push({ step: "previewCompleted", message: "Review the project preview before continuing" });
  }

  return { valid: issues.length === 0, issues };
}

/** Persists the outcome of `POST .../:id/validate` so `/complete` can rely on a fresh flag too. */
export async function saveValidationResult(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
  valid: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("project_onboarding_drafts")
    .update({ validation_completed: valid })
    .eq("id", draftId)
    .eq("admin_id", adminId);

  if (error) throw new Error(`Failed to save validation result: ${error.message}`);
}

/**
 * Step 5 / section 7 completion. Delegates the actual create to the
 * atomic `complete_project_onboarding` Postgres function (sql/006) so the
 * re-validation, project insert, and draft update happen in one
 * transaction with the draft row-locked for the duration (rule 26/55/74).
 */
export async function completeOnboarding(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
): Promise<CreatedProject> {
  const { data, error } = await supabase.rpc("complete_project_onboarding", {
    p_draft_id: draftId,
    p_admin_id: adminId,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("ONBOARDING_NOT_FOUND")) {
      throw new ProjectOnboardingError("not_found", "Onboarding draft not found");
    }
    if (message.includes("ONBOARDING_ALREADY_COMPLETED")) {
      throw new ProjectOnboardingError("already_completed", "This onboarding draft has already been completed");
    }
    if (message.includes("ONBOARDING_INCOMPLETE")) {
      throw new ProjectOnboardingError(
        "step_incomplete",
        "All onboarding steps must be completed and validated before creating the project",
      );
    }
    if (message.includes("REPOSITORY_ALREADY_ONBOARDED")) {
      throw new ProjectOnboardingError(
        "repository_already_onboarded",
        "This GitHub repository has already been onboarded as a DevTunnel project",
      );
    }
    throw new Error(`Failed to complete project onboarding: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("complete_project_onboarding returned no project row");
  }
  return { id: row.id, slug: row.slug, name: row.name };
}