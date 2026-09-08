import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreatedTask,
  DeveloperRole,
  ExperienceLevel,
  GithubIssueSummary,
  IssueInformationChoice,
  OnboardingTechStack,
  TaskOnboardingDraft,
  TaskOnboardingDraftRow,
  TaskOnboardingProjectEligibilityRow,
  TaskOnboardingProjectOption,
  TaskOnboardingValidationIssue,
  TaskOnboardingValidationResult,
} from "../types";

/** Explicit column list — never `select("*")` (Backend_Development_Rules.txt rule 23). */
const DRAFT_COLUMNS =
  "id, admin_id, project_id, project_selected, " +
  "issue_number, github_issue, issue_selected, " +
  "issue_information_choice, custom_description, issue_information_completed, " +
  "tech_stack, tech_stack_loaded, " +
  "curation_role, curation_difficulty, difficulty_defined, " +
  "preview_completed, validation_completed, " +
  "completed_task_id, completed_at, created_at, updated_at";

/**
 * Explicit column list for the eligible-project lookups below — selected
 * directly from `devtunnel.projects`, never `select("*")` (rule 23). Kept
 * intentionally small: this is a list-friendly projection
 * (`TaskOnboardingProjectOption`), not the full admin project row.
 */
const PROJECT_ELIGIBILITY_COLUMNS = "id, slug, name, github_full_name, primary_language";

/**
 * Every mutating write in this module — except the Step 6/7 endpoints
 * themselves — passes this alongside its own column changes so editing
 * any earlier step always invalidates a stale preview/validation (sql/012's
 * header comment: "don't let stale downstream state silently survive an
 * upstream change").
 */
const RESET_PREVIEW_AND_VALIDATION = { preview_completed: false, validation_completed: false };

/**
 * Errors this module raises for task-onboarding-specific business rules,
 * kept distinct from a generic thrown `Error` so route handlers
 * (src/routes/taskOnboarding.ts) can map each one to the correct HTTP
 * status without string-matching a message (rule 20: centralized,
 * predictable error handling) — same pattern as `ProjectOnboardingError`
 * (src/db/projectOnboarding.ts).
 */
export class TaskOnboardingError extends Error {
  code:
    | "not_found"
    | "already_completed"
    | "project_ineligible"
    | "conflict"
    | "issue_not_found"
    | "step_incomplete"
    | "project_unavailable";
  constructor(code: TaskOnboardingError["code"], message: string) {
    super(message);
    this.name = "TaskOnboardingError";
    this.code = code;
  }
}

function toProjectOption(row: TaskOnboardingProjectEligibilityRow): TaskOnboardingProjectOption {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    repositoryFullName: row.github_full_name ?? "",
    primaryLanguage: row.primary_language,
  };
}

/**
 * Maps a raw `devtunnel.task_onboarding_drafts` row (+ the project it
 * points at) to the frontend-facing `TaskOnboardingDraft` shape
 * (devtunnel-frontend/src/lib/admin/task-onboarding/types.ts).
 * `admin_id` is deliberately never included (rule 9: separate
 * public/private data).
 *
 * Every optional field stays `null`, and every `steps` flag stays `false`,
 * until its own step has genuinely completed server-side — never inferred
 * from a later step alone (rule 24 equivalent: backend is the sole
 * authority on completion state).
 */
export function toTaskOnboardingDraft(
  row: TaskOnboardingDraftRow,
  project: TaskOnboardingProjectOption,
): TaskOnboardingDraft {
  return {
    id: row.id,
    project,
    issue: row.issue_selected ? row.github_issue : null,
    issueInformation: row.issue_information_completed
      ? {
          choice: row.issue_information_choice as IssueInformationChoice,
          customDescription: row.custom_description,
        }
      : null,
    curation: row.difficulty_defined
      ? {
          role: row.curation_role as DeveloperRole,
          difficulty: row.curation_difficulty as ExperienceLevel,
        }
      : null,
    techStack: row.tech_stack_loaded ? row.tech_stack : null,
    steps: {
      projectSelected: row.project_selected,
      issueSelected: row.issue_selected,
      issueInformationCompleted: row.issue_information_completed,
      techStackLoaded: row.tech_stack_loaded,
      difficultyDefined: row.difficulty_defined,
      previewCompleted: row.preview_completed,
      validationCompleted: row.validation_completed,
    },
  };
}

/**
 * Step 1 (Backend) — eligible means an active, non-deleted DevTunnel
 * project: `status = 'ACTIVE'` (sql/006) and `deleted_at is null`
 * (sql/008). Queried directly against `devtunnel.projects` rather than
 * the `admin_project_list` view, applying both eligibility predicates
 * explicitly (rule 5: never invent/assume schema that hasn't actually
 * been verified).
 *
 * Backs `GET /admin/tasks/onboarding/projects`.
 */
export async function listEligibleTaskOnboardingProjects(
  supabase: SupabaseClient,
): Promise<TaskOnboardingProjectOption[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_ELIGIBILITY_COLUMNS)
    .eq("status", "ACTIVE")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  if (error) throw new Error(`Failed to load eligible task-onboarding projects: ${error.message}`);

  return ((data ?? []) as TaskOnboardingProjectEligibilityRow[]).map(toProjectOption);
}

/**
 * Single-project eligibility check, re-run server-side on every project
 * selection — never trusts that a `projectId` came from the (already
 * filtered) `GET .../projects` list a moment earlier (rule 15). Returns
 * `null` when the project doesn't exist or isn't eligible.
 */
async function getEligibleTaskOnboardingProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<TaskOnboardingProjectOption | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_ELIGIBILITY_COLUMNS)
    .eq("id", projectId)
    .eq("status", "ACTIVE")
    .is("deleted_at", null)
    .maybeSingle<TaskOnboardingProjectEligibilityRow>();

  if (error) throw new Error(`Failed to load project for task onboarding: ${error.message}`);
  return data ? toProjectOption(data) : null;
}

/**
 * Loads a *project* (not eligibility-filtered — a draft's project may have
 * been onboarded well before this step, and the admin never re-selects it
 * here) purely for response-building (`toTaskOnboardingDraft` needs a
 * `TaskOnboardingProjectOption`). Used by every Step 2–5 route after
 * writing to a draft, so the response always reflects the project the
 * draft is actually attached to. Returns `null` if the project has since
 * been deleted — the caller treats that as a conflict on the draft, not a
 * silent stale response (rule 73: never trust a prior read as still
 * valid).
 */
export async function getTaskOnboardingProjectById(
  supabase: SupabaseClient,
  projectId: string,
): Promise<TaskOnboardingProjectOption | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_ELIGIBILITY_COLUMNS)
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle<TaskOnboardingProjectEligibilityRow>();

  if (error) throw new Error(`Failed to load task onboarding draft's project: ${error.message}`);
  return data ? toProjectOption(data) : null;
}

/**
 * Loads a draft, scoped to the requesting admin (`admin_id = adminId`).
 * Returns `null` for both "doesn't exist" and "belongs to a different
 * admin" (rule 13: prevent IDOR).
 */
export async function getTaskOnboardingDraftForAdmin(
  supabase: SupabaseClient,
  draftId: string,
  adminId: string,
): Promise<TaskOnboardingDraftRow | null> {
  const { data, error } = await supabase
    .from("task_onboarding_drafts")
    .select(DRAFT_COLUMNS)
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .maybeSingle<TaskOnboardingDraftRow>();

  if (error) throw new Error(`Failed to load task onboarding draft: ${error.message}`);
  return data;
}

async function requireEditableDraft(
  supabase: SupabaseClient,
  draftId: string,
  adminId: string,
): Promise<TaskOnboardingDraftRow> {
  const draft = await getTaskOnboardingDraftForAdmin(supabase, draftId, adminId);
  if (!draft) {
    throw new TaskOnboardingError("not_found", "Task onboarding draft not found");
  }
  if (draft.completed_task_id) {
    throw new TaskOnboardingError(
      "already_completed",
      "This task onboarding draft has already been completed and can no longer be edited",
    );
  }
  return draft;
}

/**
 * Step 1 write. Creates a new draft when `draftId` is omitted, or re-runs
 * project selection against an existing (not-yet-completed) draft owned
 * by this admin.
 *
 * Selecting a *different* project than the one already attached resets
 * every later step (issue, issue information, tech stack, curation,
 * preview, validation) back to incomplete — those steps were built
 * against the previous project's repository/tech stack, so they can no
 * longer be trusted once the project changes (rule 26: don't let stale
 * downstream state silently survive an upstream change).
 */
export async function selectTaskOnboardingProject(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string | undefined,
  projectId: string,
): Promise<{ draft: TaskOnboardingDraftRow; project: TaskOnboardingProjectOption }> {
  let existing: TaskOnboardingDraftRow | null = null;
  if (draftId) {
    existing = await requireEditableDraft(supabase, draftId, adminId);
  }

  const project = await getEligibleTaskOnboardingProject(supabase, projectId);
  if (!project) {
    throw new TaskOnboardingError(
      "project_ineligible",
      "This project isn't available for task onboarding — it may have been deleted or is no longer active",
    );
  }

  const projectChanged = existing !== null && existing.project_id !== project.id;

  const values: Record<string, unknown> = {
    admin_id: adminId,
    project_id: project.id,
    project_selected: true,
  };

  if (projectChanged) {
    values.issue_number = null;
    values.github_issue = null;
    values.issue_selected = false;
    values.issue_information_choice = null;
    values.custom_description = null;
    values.issue_information_completed = false;
    values.tech_stack = null;
    values.tech_stack_loaded = false;
    values.curation_role = null;
    values.curation_difficulty = null;
    values.difficulty_defined = false;
    Object.assign(values, RESET_PREVIEW_AND_VALIDATION);
  }

  const query = draftId
    ? supabase.from("task_onboarding_drafts").update(values).eq("id", draftId).eq("admin_id", adminId)
    : supabase.from("task_onboarding_drafts").insert(values);

  const { data, error } = await query.select(DRAFT_COLUMNS).single<TaskOnboardingDraftRow>();
  if (error) throw new Error(`Failed to save task onboarding project selection: ${error.message}`);

  return { draft: data, project };
}

/**
 * Step 2 write. Requires an already-editable draft owned by this admin
 * (`requireEditableDraft`). `issue` must already be the backend's own
 * re-fetched snapshot from GitHub (src/lib/githubRepo.ts
 * `fetchRepositoryIssue`) — this function never fetches from GitHub
 * itself, keeping the "external API call" and "persist the result"
 * concerns separated the same way `selectTaskOnboardingProject` above
 * separates eligibility-checking from writing.
 *
 * Always resets preview/validation (any issue write, changed or not,
 * invalidates a stale preview the same way re-running Step 1's import
 * does in Project Onboarding); additionally resets Step 3 (issue
 * information) when the issue itself actually changed, since that step's
 * custom description was written against the previous issue's content.
 */
export async function selectTaskOnboardingIssue(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
  issue: GithubIssueSummary,
): Promise<TaskOnboardingDraftRow> {
  const existing = await requireEditableDraft(supabase, draftId, adminId);
  const issueChanged = existing.issue_number !== issue.number;

  const values: Record<string, unknown> = {
    issue_number: issue.number,
    github_issue: issue,
    issue_selected: true,
    ...RESET_PREVIEW_AND_VALIDATION,
  };

  if (issueChanged) {
    values.issue_information_choice = null;
    values.custom_description = null;
    values.issue_information_completed = false;
  }

  const { data, error } = await supabase
    .from("task_onboarding_drafts")
    .update(values)
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .select(DRAFT_COLUMNS)
    .single<TaskOnboardingDraftRow>();

  if (error) throw new Error(`Failed to save task onboarding issue selection: ${error.message}`);
  return data;
}

/**
 * Step 3 write. Requires Step 2 to have already completed
 * (`issue_selected`) — enforced here in addition to sql/010's database
 * constraint (`task_onboarding_drafts_issue_info_requires_issue`) so the
 * route gets a clean, mapped `TaskOnboardingError` instead of a raw
 * Postgres constraint-violation message (rule 20).
 */
export async function saveTaskIssueInformation(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
  choice: IssueInformationChoice,
  customDescription: string | null,
): Promise<TaskOnboardingDraftRow> {
  const existing = await requireEditableDraft(supabase, draftId, adminId);
  if (!existing.issue_selected) {
    throw new TaskOnboardingError(
      "step_incomplete",
      "Select an issue before saving issue information",
    );
  }

  const values = {
    issue_information_choice: choice,
    custom_description: choice === "CUSTOM" ? customDescription : null,
    issue_information_completed: true,
    ...RESET_PREVIEW_AND_VALIDATION,
  };

  const { data, error } = await supabase
    .from("task_onboarding_drafts")
    .update(values)
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .select(DRAFT_COLUMNS)
    .single<TaskOnboardingDraftRow>();

  if (error) throw new Error(`Failed to save task onboarding issue information: ${error.message}`);
  return data;
}

/**
 * Step 4 write. `techStack` must already be the project's own
 * backend-read tech stack (src/db/adminProjects.ts `getProjectTechStack`)
 * — this function never reads the project itself, same
 * fetch/persist separation as `selectTaskOnboardingIssue` above.
 */
export async function attachTaskOnboardingTechStack(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
  techStack: OnboardingTechStack,
): Promise<TaskOnboardingDraftRow> {
  await requireEditableDraft(supabase, draftId, adminId);

  const { data, error } = await supabase
    .from("task_onboarding_drafts")
    .update({ tech_stack: techStack, tech_stack_loaded: true, ...RESET_PREVIEW_AND_VALIDATION })
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .select(DRAFT_COLUMNS)
    .single<TaskOnboardingDraftRow>();

  if (error) throw new Error(`Failed to save task onboarding tech stack: ${error.message}`);
  return data;
}

/**
 * Step 5 write. `role`/`difficulty` reuse the exact
 * `DeveloperRole`/`ExperienceLevel` enums `devtunnel.users` already
 * defines (sql/002) — validated by the route's Zod schema
 * (src/routes/taskOnboarding.ts `curationSchema`) before ever reaching
 * here.
 */
export async function saveTaskCuration(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
  role: DeveloperRole,
  difficulty: ExperienceLevel,
): Promise<TaskOnboardingDraftRow> {
  await requireEditableDraft(supabase, draftId, adminId);

  const { data, error } = await supabase
    .from("task_onboarding_drafts")
    .update({
      curation_role: role,
      curation_difficulty: difficulty,
      difficulty_defined: true,
      ...RESET_PREVIEW_AND_VALIDATION,
    })
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .select(DRAFT_COLUMNS)
    .single<TaskOnboardingDraftRow>();

  if (error) throw new Error(`Failed to save task onboarding difficulty: ${error.message}`);
  return data;
}

/**
 * Step 6 checkpoint. `GET .../:id/preview` calls this once it has loaded
 * the draft — marking `preview_completed` only once Steps 1–5 already
 * are, matching the wizard's own linear step order (admin_workflow.txt
 * section 10's flow) — same convention as Project Onboarding's
 * `markPreviewCompleted` (src/db/projectOnboarding.ts).
 */
export async function markTaskPreviewCompleted(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
): Promise<TaskOnboardingDraftRow> {
  const draft = await requireEditableDraft(supabase, draftId, adminId);
  if (
    !draft.project_selected ||
    !draft.issue_selected ||
    !draft.issue_information_completed ||
    !draft.tech_stack_loaded ||
    !draft.difficulty_defined
  ) {
    throw new TaskOnboardingError(
      "step_incomplete",
      "Complete the issue, issue information, tech-stack, and difficulty steps before previewing the task",
    );
  }
  if (draft.preview_completed) return draft;

  const { data, error } = await supabase
    .from("task_onboarding_drafts")
    .update({ preview_completed: true })
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .select(DRAFT_COLUMNS)
    .single<TaskOnboardingDraftRow>();

  if (error) throw new Error(`Failed to mark task preview completed: ${error.message}`);
  return data;
}

/**
 * Step 7 — re-derives validity directly from the draft's actual stored
 * data (never trusts the cached `*_completed`/`*_selected`/`*_defined`
 * flags alone), matching section 24/25: the backend is the sole
 * authority on completion state. Mirrors
 * `computeValidation` (src/db/projectOnboarding.ts) for the Task
 * Onboarding checklist instead of Project Onboarding's.
 */
export function computeTaskOnboardingValidation(
  row: TaskOnboardingDraftRow,
): TaskOnboardingValidationResult {
  const issues: TaskOnboardingValidationIssue[] = [];

  if (!row.project_selected || !row.project_id) {
    issues.push({ step: "projectSelected", message: "Select a project for this task" });
  }

  if (!row.issue_selected || !row.github_issue || !row.issue_number) {
    issues.push({ step: "issueSelected", message: "Select a GitHub issue for this task" });
  }

  if (!row.issue_information_completed || !row.issue_information_choice) {
    issues.push({ step: "issueInformationCompleted", message: "Choose how the issue information should be sourced" });
  } else if (row.issue_information_choice === "CUSTOM" && !row.custom_description?.trim()) {
    issues.push({ step: "issueInformationCompleted", message: "Custom information cannot be empty" });
  }

  if (!row.tech_stack_loaded || !row.tech_stack) {
    issues.push({ step: "techStackLoaded", message: "Attach the project's tech stack to this task" });
  }

  if (!row.difficulty_defined || !row.curation_role || !row.curation_difficulty) {
    issues.push({ step: "difficultyDefined", message: "Set a role and difficulty for this task" });
  }

  if (!row.preview_completed) {
    issues.push({ step: "previewCompleted", message: "Review the task preview before continuing" });
  }

  return { valid: issues.length === 0, issues };
}

/** Persists the outcome of `POST .../:id/validate` so `/complete` can rely on a fresh flag too. */
export async function saveTaskValidationResult(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
  valid: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("task_onboarding_drafts")
    .update({ validation_completed: valid })
    .eq("id", draftId)
    .eq("admin_id", adminId);

  if (error) throw new Error(`Failed to save task onboarding validation result: ${error.message}`);
}

/**
 * Section 12 completion. Delegates the actual create to the atomic
 * `complete_task_onboarding` Postgres function (sql/012) so the
 * re-validation, task insert, and draft update happen in one transaction
 * with the draft row-locked for the duration (rule 26/55/74) — same
 * pattern as `completeOnboarding` (src/db/projectOnboarding.ts).
 */
export async function completeTaskOnboarding(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
): Promise<CreatedTask> {
  const { data, error } = await supabase.rpc("complete_task_onboarding", {
    p_draft_id: draftId,
    p_admin_id: adminId,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("TASK_ONBOARDING_NOT_FOUND")) {
      throw new TaskOnboardingError("not_found", "Task onboarding draft not found");
    }
    if (message.includes("TASK_ONBOARDING_ALREADY_COMPLETED")) {
      throw new TaskOnboardingError("already_completed", "This task onboarding draft has already been completed");
    }
    if (message.includes("TASK_ONBOARDING_INCOMPLETE")) {
      throw new TaskOnboardingError(
        "step_incomplete",
        "All task onboarding steps must be completed and validated before creating the task",
      );
    }
    if (message.includes("TASK_ONBOARDING_PROJECT_UNAVAILABLE")) {
      throw new TaskOnboardingError(
        "project_unavailable",
        "This draft's project is no longer available — it may have been deleted",
      );
    }
    throw new Error(`Failed to complete task onboarding: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("complete_task_onboarding returned no task row");
  }
  return { id: row.id, slug: row.slug, title: row.title, projectSlug: row.project_slug };
}