// devtunnel-backend/src/db/opensourceToolOnboarding.ts

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CreatedOpenSourceTool,
  DescriptionChoice,
  OpenSourceToolOnboardingDraftRow,
  ToolOnboardingDraft,
  ToolOnboardingValidationIssue,
  ToolOnboardingValidationResult,
} from "../types";

/** Explicit column list — never `select("*")` (Backend_Development_Rules.md rule 23). */
const DRAFT_COLUMNS =
  "id, admin_id, source_url, source_name, source_fetched_description, source_readme, " +
  "source_primary_language, url_completed, " +
  "description_choice, custom_description, description_completed, " +
  "labels, labels_completed, " +
  "setup_guide_content, setup_guide_completed, " +
  "preview_completed, validation_completed, " +
  "completed_tool_id, completed_at, created_at, updated_at";

/**
 * Errors this module raises for onboarding-specific business rules, kept
 * distinct from a generic thrown `Error` so route handlers
 * (src/routes/opensourceToolOnboarding.ts) can map each one to the
 * correct HTTP status without string-matching a message (rule 20:
 * centralized, predictable error handling). Mirrors
 * `ProjectOnboardingError` (src/db/projectOnboarding.ts) field-for-field —
 * `tool_already_onboarded` is this flow's equivalent of that module's
 * `repository_already_onboarded`.
 */
export class ToolOnboardingError extends Error {
  code:
    | "not_found"
    | "already_completed"
    | "step_incomplete"
    | "tool_already_onboarded"
    | "conflict";
  constructor(code: ToolOnboardingError["code"], message: string) {
    super(message);
    this.name = "ToolOnboardingError";
    this.code = code;
  }
}

/**
 * Maps a raw `devtunnel.opensource_tool_onboarding_drafts` row to the
 * frontend-facing `ToolOnboardingDraft` shape
 * (devtunnel-frontend/src/lib/admin/opensource-tool-onboarding/types.ts).
 * `admin_id` and every other internal-only column are deliberately never
 * included in the returned object (rule 9: separate public/private data —
 * here, "public" means "visible to the owning admin", still narrower
 * than the full row).
 */
export function toOnboardingDraft(row: OpenSourceToolOnboardingDraftRow): ToolOnboardingDraft {
  return {
    id: row.id,
    source:
      row.source_url !== null && row.source_name !== null
        ? {
            url: row.source_url,
            name: row.source_name,
            fetchedDescription: row.source_fetched_description,
            readme: row.source_readme,
            primaryLanguage: row.source_primary_language,
          }
        : null,
    description:
      row.description_choice !== null
        ? { choice: row.description_choice, customDescription: row.custom_description }
        : null,
    labels: row.labels !== null ? { values: row.labels } : null,
    setupGuide:
      row.setup_guide_content.length > 0 || row.setup_guide_completed
        ? { content: row.setup_guide_content }
        : null,
    steps: {
      urlCompleted: row.url_completed,
      descriptionCompleted: row.description_completed,
      labelsCompleted: row.labels_completed,
      setupGuideCompleted: row.setup_guide_completed,
      previewCompleted: row.preview_completed,
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
): Promise<OpenSourceToolOnboardingDraftRow | null> {
  const { data, error } = await supabase
    .from("opensource_tool_onboarding_drafts")
    .select(DRAFT_COLUMNS)
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .maybeSingle<OpenSourceToolOnboardingDraftRow>();

  if (error) throw new Error(`Failed to load tool onboarding draft: ${error.message}`);
  return data;
}

async function requireDraft(
  supabase: SupabaseClient,
  draftId: string,
  adminId: string,
): Promise<OpenSourceToolOnboardingDraftRow> {
  const draft = await getDraftForAdmin(supabase, draftId, adminId);
  if (!draft) {
    throw new ToolOnboardingError("not_found", "Onboarding draft not found");
  }
  if (draft.completed_tool_id) {
    throw new ToolOnboardingError(
      "already_completed",
      "This onboarding draft has already been completed and can no longer be edited",
    );
  }
  return draft;
}

/**
 * Early duplicate check for Step 1 (`saveUrlImport` below). The
 * row-locked check inside `complete_opensource_tool_onboarding`
 * (sql/017) is the real, race-safe guard against onboarding the same URL
 * twice — this is purely a fast-fail so an admin who imports an
 * already-onboarded tool's URL finds out immediately, instead of
 * clicking through all four remaining wizard steps only to hit
 * `TOOL_ALREADY_ONBOARDED` on the final "Create Tool" click. Same
 * reasoning as `isRepositoryAlreadyOnboarded`
 * (src/db/projectOnboarding.ts).
 */
async function isToolAlreadyOnboarded(supabase: SupabaseClient, sourceUrl: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("opensource_tools")
    .select("id")
    .eq("source_url", sourceUrl)
    .maybeSingle<{ id: string }>();

  if (error) throw new Error(`Failed to check for an already-onboarded tool: ${error.message}`);
  return data !== null;
}

export interface ToolSourceImportInput {
  url: string;
  name: string;
  fetchedDescription: string | null;
  readme: string | null;
  primaryLanguage: string | null;
}

/**
 * Step 1 write. Creates a new draft when `draftId` is omitted, or
 * re-imports into an existing (not-yet-completed) draft owned by this
 * admin — re-running Step 1 always resets Steps 2–5's completion flags
 * (but not their stored values) since a different tool invalidates
 * whatever description/labels/setup-guide choices were made against the
 * previous source. Mirrors `saveRepositoryImport`
 * (src/db/projectOnboarding.ts).
 */
export async function saveUrlImport(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string | undefined,
  input: ToolSourceImportInput,
): Promise<OpenSourceToolOnboardingDraftRow> {
  if (draftId) {
    await requireDraft(supabase, draftId, adminId);
  }

  // Fast-fail duplicate check (see `isToolAlreadyOnboarded` above) — this
  // is a courtesy early error, not the source of truth; the row-locked
  // check inside `complete_opensource_tool_onboarding` (sql/017) is what
  // actually prevents a race from creating two catalog tools for the
  // same URL.
  if (await isToolAlreadyOnboarded(supabase, input.url)) {
    throw new ToolOnboardingError(
      "tool_already_onboarded",
      "This URL has already been onboarded as an open source tool",
    );
  }

  const values = {
    admin_id: adminId,
    source_url: input.url,
    source_name: input.name,
    source_fetched_description: input.fetchedDescription,
    source_readme: input.readme,
    source_primary_language: input.primaryLanguage,
    url_completed: true,
    // A fresh (or re-run) URL import invalidates anything that was
    // derived from the *previous* source — never silently carry a stale
    // description/labels/setup-guide/preview/validation state forward.
    description_completed: false,
    labels_completed: false,
    setup_guide_completed: false,
    preview_completed: false,
    validation_completed: false,
  };

  const query = draftId
    ? supabase.from("opensource_tool_onboarding_drafts").update(values).eq("id", draftId).eq("admin_id", adminId)
    : supabase.from("opensource_tool_onboarding_drafts").insert(values);

  const { data, error } = await query.select(DRAFT_COLUMNS).single<OpenSourceToolOnboardingDraftRow>();
  if (error) throw new Error(`Failed to save tool URL import: ${error.message}`);
  return data;
}

/** Step 2 write. */
export async function saveDescription(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
  choice: DescriptionChoice,
  customDescription: string | null,
): Promise<OpenSourceToolOnboardingDraftRow> {
  const draft = await requireDraft(supabase, draftId, adminId);
  if (!draft.url_completed) {
    throw new ToolOnboardingError(
      "step_incomplete",
      "Import a tool URL before setting the description",
    );
  }

  const { data, error } = await supabase
    .from("opensource_tool_onboarding_drafts")
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
    .single<OpenSourceToolOnboardingDraftRow>();

  if (error) throw new Error(`Failed to save tool description: ${error.message}`);
  return data;
}

/**
 * Step 3 write. `labels_completed` reflects whether the admin actually
 * tagged at least one audience label — an empty list is a legitimate
 * intermediate state (the step form autosaves as labels are added or
 * removed), not a completed step, so this is decided here rather than
 * unconditionally like `saveDescription` above (same
 * "backend decides whether the content is enough" convention
 * `saveToolSetupGuide`'s own doc comment in api.ts documents for Step 4).
 */
export async function saveLabels(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
  values: string[],
): Promise<OpenSourceToolOnboardingDraftRow> {
  const draft = await requireDraft(supabase, draftId, adminId);
  if (!draft.url_completed) {
    throw new ToolOnboardingError("step_incomplete", "Import a tool URL before setting labels");
  }

  // Trim and drop empties defensively — the frontend's `LabelsStep` is a
  // free-form tag input, so this never trusts blank/whitespace-only
  // entries as real labels (rule 14: validate every input).
  const cleaned = values.map((v) => v.trim()).filter((v) => v.length > 0);

  const { data, error } = await supabase
    .from("opensource_tool_onboarding_drafts")
    .update({
      labels: cleaned,
      labels_completed: cleaned.length > 0,
      preview_completed: false,
      validation_completed: false,
    })
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .select(DRAFT_COLUMNS)
    .single<OpenSourceToolOnboardingDraftRow>();

  if (error) throw new Error(`Failed to save tool labels: ${error.message}`);
  return data;
}

/**
 * Step 4 write. `setup_guide_completed` reflects whether the admin has
 * actually written something — matching `saveToolSetupGuide`'s own doc
 * comment (devtunnel-frontend .../api.ts): "the backend, not this
 * frontend, decides whether the content is enough to mark
 * setupGuideCompleted true".
 */
export async function saveSetupGuide(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
  content: string,
): Promise<OpenSourceToolOnboardingDraftRow> {
  const draft = await requireDraft(supabase, draftId, adminId);
  if (!draft.url_completed) {
    throw new ToolOnboardingError(
      "step_incomplete",
      "Import a tool URL before writing the setup & usage guide",
    );
  }

  const { data, error } = await supabase
    .from("opensource_tool_onboarding_drafts")
    .update({
      setup_guide_content: content,
      setup_guide_completed: content.trim().length > 0,
      preview_completed: false,
      validation_completed: false,
    })
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .select(DRAFT_COLUMNS)
    .single<OpenSourceToolOnboardingDraftRow>();

  if (error) throw new Error(`Failed to save the setup & usage guide: ${error.message}`);
  return data;
}

/**
 * Step 5 checkpoint. `GET .../:id/preview` calls this once it has loaded
 * the draft — marking `preview_completed` only once Steps 1–4 already
 * are, matching the wizard's own linear step order. Mirrors
 * `markPreviewCompleted` (src/db/projectOnboarding.ts).
 */
export async function markPreviewCompleted(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
): Promise<OpenSourceToolOnboardingDraftRow> {
  const draft = await requireDraft(supabase, draftId, adminId);
  if (
    !draft.url_completed ||
    !draft.description_completed ||
    !draft.labels_completed ||
    !draft.setup_guide_completed
  ) {
    throw new ToolOnboardingError(
      "step_incomplete",
      "Complete the URL, description, labels, and setup guide steps before previewing the tool",
    );
  }
  if (draft.preview_completed) return draft;

  const { data, error } = await supabase
    .from("opensource_tool_onboarding_drafts")
    .update({ preview_completed: true })
    .eq("id", draftId)
    .eq("admin_id", adminId)
    .select(DRAFT_COLUMNS)
    .single<OpenSourceToolOnboardingDraftRow>();

  if (error) throw new Error(`Failed to mark preview completed: ${error.message}`);
  return data;
}

/**
 * Re-derives validity directly from the draft's actual stored data
 * (never trusts the cached `*_completed` flags alone) — the backend is
 * the sole authority on completion state (rule 10). Mirrors
 * `computeValidation` (src/db/projectOnboarding.ts).
 */
export function computeValidation(row: OpenSourceToolOnboardingDraftRow): ToolOnboardingValidationResult {
  const issues: ToolOnboardingValidationIssue[] = [];

  if (!row.url_completed || !row.source_url || !row.source_name) {
    issues.push({ step: "urlCompleted", message: "Import a valid tool URL" });
  }

  if (!row.description_completed || !row.description_choice) {
    issues.push({ step: "descriptionCompleted", message: "Choose how the tool description should be sourced" });
  } else if (row.description_choice === "CUSTOM" && !row.custom_description?.trim()) {
    issues.push({ step: "descriptionCompleted", message: "Custom description cannot be empty" });
  }

  if (!row.labels_completed || !row.labels || row.labels.length === 0) {
    issues.push({ step: "labelsCompleted", message: "Add at least one audience label" });
  }

  if (!row.setup_guide_completed || !row.setup_guide_content.trim()) {
    issues.push({ step: "setupGuideCompleted", message: "Write the setup & usage guide" });
  }

  if (!row.preview_completed) {
    issues.push({ step: "previewCompleted", message: "Review the tool preview before continuing" });
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
    .from("opensource_tool_onboarding_drafts")
    .update({ validation_completed: valid })
    .eq("id", draftId)
    .eq("admin_id", adminId);

  if (error) throw new Error(`Failed to save validation result: ${error.message}`);
}

/**
 * Final completion. Delegates the actual create to the atomic
 * `complete_opensource_tool_onboarding` Postgres function (sql/017) so
 * the re-validation, tool insert, and draft update happen in one
 * transaction with the draft row-locked for the duration (rule 26/55/74).
 * Mirrors `completeOnboarding` (src/db/projectOnboarding.ts).
 */
export async function completeOnboarding(
  supabase: SupabaseClient,
  adminId: string,
  draftId: string,
): Promise<CreatedOpenSourceTool> {
  const { data, error } = await supabase.rpc("complete_opensource_tool_onboarding", {
    p_draft_id: draftId,
    p_admin_id: adminId,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("TOOL_ONBOARDING_NOT_FOUND")) {
      throw new ToolOnboardingError("not_found", "Onboarding draft not found");
    }
    if (message.includes("TOOL_ONBOARDING_ALREADY_COMPLETED")) {
      throw new ToolOnboardingError("already_completed", "This onboarding draft has already been completed");
    }
    if (message.includes("TOOL_ONBOARDING_INCOMPLETE")) {
      throw new ToolOnboardingError(
        "step_incomplete",
        "All onboarding steps must be completed and validated before creating the tool",
      );
    }
    if (message.includes("TOOL_ALREADY_ONBOARDED")) {
      throw new ToolOnboardingError(
        "tool_already_onboarded",
        "This URL has already been onboarded as an open source tool",
      );
    }
    throw new Error(`Failed to complete tool onboarding: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("complete_opensource_tool_onboarding returned no tool row");
  }
  return { id: row.id, slug: row.slug, name: row.name };
}