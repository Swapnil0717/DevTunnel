import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  TaskOnboardingDraft,
  TaskOnboardingDraftRow,
  TaskOnboardingProjectEligibilityRow,
  TaskOnboardingProjectOption,
} from "../types";

/** Explicit column list — never `select("*")` (Backend_Development_Rules.txt rule 23). */
const DRAFT_COLUMNS =
  "id, admin_id, project_id, project_selected, completed_task_id, completed_at, created_at, updated_at";

/**
 * Explicit column list for the eligible-project lookups below — selected
 * directly from `devtunnel.projects`, never `select("*")` (rule 23). Kept
 * intentionally small: this is a list-friendly projection
 * (`TaskOnboardingProjectOption`), not the full admin project row.
 */
const PROJECT_ELIGIBILITY_COLUMNS = "id, slug, name, github_full_name, primary_language";

/**
 * Errors this module raises for task-onboarding-specific business rules,
 * kept distinct from a generic thrown `Error` so route handlers
 * (src/routes/taskOnboarding.ts) can map each one to the correct HTTP
 * status without string-matching a message (rule 20: centralized,
 * predictable error handling) — same pattern as `ProjectOnboardingError`
 * (src/db/projectOnboarding.ts).
 */
export class TaskOnboardingError extends Error {
  code: "not_found" | "already_completed" | "project_ineligible" | "conflict";
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
 * (devtunnel-frontend/src/lib/admin/task-onboarding/types.ts). `admin_id`
 * is deliberately never included (rule 9: separate public/private data —
 * here, "public" means "visible to the owning admin", still narrower than
 * the full row).
 *
 * `issue`, `issueInformation`, `curation`, and `techStack` are always
 * `null` and their corresponding `steps` flags always `false` — Steps 2–7
 * of this wizard are not yet implemented, and this function must never
 * fabricate progress the draft hasn't actually made (rule 24 equivalent:
 * backend is the sole authority on completion state).
 */
export function toTaskOnboardingDraft(
  row: TaskOnboardingDraftRow,
  project: TaskOnboardingProjectOption,
): TaskOnboardingDraft {
  return {
    id: row.id,
    project,
    issue: null,
    issueInformation: null,
    curation: null,
    techStack: null,
    steps: {
      projectSelected: row.project_selected,
      issueSelected: false,
      issueInformationCompleted: false,
      techStackLoaded: false,
      difficultyDefined: false,
      previewCompleted: false,
      validationCompleted: false,
    },
  };
}

/**
 * Step 1 (Backend) — "Only active/eligible DevTunnel projects should be
 * selectable." Eligible means an active, non-deleted DevTunnel project:
 * `status = 'ACTIVE'` (devtunnel.project_status, sql/006) and
 * `deleted_at is null` (soft-delete marker, sql/008). Queried directly
 * against `devtunnel.projects` rather than the `admin_project_list` view
 * (src/db/adminProjects.ts) because that view is not yet confirmed to
 * exclude soft-deleted rows itself (see sql/008's header note) — this
 * query applies both eligibility predicates explicitly rather than
 * inheriting an assumption about the view's definition (rule 5: never
 * invent/assume schema that hasn't actually been verified).
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
 * filtered) `GET .../projects` list a moment earlier (rule 15: never trust
 * frontend validation; re-validate on every mutating request, since the
 * project could have been deleted or archived between the two calls).
 * Returns `null` when the project doesn't exist or isn't eligible —
 * indistinguishable to the caller, since neither case should be
 * selectable (mirrors the IDOR-safe "not found" posture used elsewhere in
 * this codebase, rule 13).
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
 * Loads a draft, scoped to the requesting admin (`admin_id = adminId`).
 * Returns `null` for both "doesn't exist" and "belongs to a different
 * admin" — indistinguishable to the caller, which is deliberate (rule 13:
 * prevent IDOR — never reveal that a resource exists for someone else).
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
 * by this admin — same "pass an existing draftId to update instead of
 * orphaning a second draft" convention as `saveRepositoryImport`
 * (src/db/projectOnboarding.ts).
 *
 * Always re-validates the project's eligibility itself (see
 * `getEligibleTaskOnboardingProject` above) before writing anything.
 */
export async function selectTaskOnboardingProject(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string | undefined,
  projectId: string,
): Promise<{ draft: TaskOnboardingDraftRow; project: TaskOnboardingProjectOption }> {
  if (draftId) {
    await requireEditableDraft(supabase, draftId, adminId);
  }

  const project = await getEligibleTaskOnboardingProject(supabase, projectId);
  if (!project) {
    throw new TaskOnboardingError(
      "project_ineligible",
      "This project isn't available for task onboarding — it may have been deleted or is no longer active",
    );
  }

  const values = {
    admin_id: adminId,
    project_id: project.id,
    project_selected: true,
  };

  const query = draftId
    ? supabase.from("task_onboarding_drafts").update(values).eq("id", draftId).eq("admin_id", adminId)
    : supabase.from("task_onboarding_drafts").insert(values);

  const { data, error } = await query.select(DRAFT_COLUMNS).single<TaskOnboardingDraftRow>();
  if (error) throw new Error(`Failed to save task onboarding project selection: ${error.message}`);

  return { draft: data, project };
}