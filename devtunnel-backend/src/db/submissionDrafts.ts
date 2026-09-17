import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubmissionKind } from "./submissions";

/**
 * The 3-step submit wizard's working state —
 * `devtunnel.user_submission_drafts` (sql/028).
 *
 * Same posture as src/db/projectOnboarding.ts and
 * src/db/opensourceToolOnboarding.ts: a draft is never a published
 * submission, and the completion flags live here, on the server, rather
 * than being inferred from whatever the wizard happens to have in
 * component state. The frontend reads `steps` back from every response
 * instead of deciding for itself that a step is done.
 *
 * Publication is `devtunnel.complete_user_submission()` and nothing else
 * — see `completeSubmissionDraft` at the bottom.
 */

export interface SubmissionDraftSource {
  url: string;
  name: string;
  repositoryFullName: string | null;
  /** Description exactly as GitHub returned it. Never rewritten. */
  fetchedDescription: string | null;
  readme: string | null;
  primaryLanguage: string | null;
  /** Tech stack detected from the repository — the starting point step 2 edits. */
  detectedTechStack: string[];
}

export interface SubmissionDraftDetails {
  descriptionSource: "EXISTING" | "CUSTOM";
  customDescription: string | null;
  techStack: string[];
  isPaidAlternative: boolean;
  alternativeTo: string[];
}

export interface SubmissionDraftSteps {
  sourceCompleted: boolean;
  detailsCompleted: boolean;
}

export interface SubmissionDraft {
  id: string;
  kind: SubmissionKind;
  source: SubmissionDraftSource | null;
  details: SubmissionDraftDetails;
  steps: SubmissionDraftSteps;
  /** Set once the draft has been published — the wizard treats this as "done". */
  completedSubmissionId: string | null;
}

interface DraftRow {
  id: string;
  created_by: string;
  kind: SubmissionKind;
  source_url: string | null;
  source_name: string | null;
  repository_full_name: string | null;
  fetched_description: string | null;
  readme: string | null;
  primary_language: string | null;
  detected_tech_stack: string[] | null;
  description_source: "EXISTING" | "CUSTOM";
  custom_description: string | null;
  tech_stack: string[] | null;
  is_paid_alternative: boolean;
  alternative_to: string[] | null;
  source_completed: boolean;
  details_completed: boolean;
  completed_submission_id: string | null;
}

/** Explicit column list, never `select("*")` (rule 23). */
const DRAFT_COLUMNS = [
  "id",
  "created_by",
  "kind",
  "source_url",
  "source_name",
  "repository_full_name",
  "fetched_description",
  "readme",
  "primary_language",
  "detected_tech_stack",
  "description_source",
  "custom_description",
  "tech_stack",
  "is_paid_alternative",
  "alternative_to",
  "source_completed",
  "details_completed",
  "completed_submission_id",
].join(", ");

function toDraft(row: DraftRow): SubmissionDraft {
  return {
    id: row.id,
    kind: row.kind,
    source:
      row.source_url && row.source_name
        ? {
            url: row.source_url,
            name: row.source_name,
            repositoryFullName: row.repository_full_name,
            fetchedDescription: row.fetched_description,
            readme: row.readme,
            primaryLanguage: row.primary_language,
            detectedTechStack: Array.isArray(row.detected_tech_stack)
              ? row.detected_tech_stack
              : [],
          }
        : null,
    details: {
      descriptionSource: row.description_source,
      customDescription: row.custom_description,
      techStack: Array.isArray(row.tech_stack) ? row.tech_stack : [],
      isPaidAlternative: row.is_paid_alternative,
      alternativeTo: Array.isArray(row.alternative_to) ? row.alternative_to : [],
    },
    steps: {
      sourceCompleted: row.source_completed,
      detailsCompleted: row.details_completed,
    },
    completedSubmissionId: row.completed_submission_id,
  };
}

/**
 * Reads a draft, scoped to its owner.
 *
 * `userId` is part of the query, not checked afterwards: a draft id is
 * not a capability, and one contributor must never be able to read or
 * edit another's draft by guessing a uuid (rule 30). A draft belonging
 * to someone else is indistinguishable from one that doesn't exist,
 * which is the correct answer to give either way.
 */
export async function getSubmissionDraft(
  supabase: SupabaseClient,
  draftId: string,
  userId: string,
): Promise<SubmissionDraft | null> {
  const { data, error } = await supabase
    .from("user_submission_drafts")
    .select(DRAFT_COLUMNS)
    .eq("id", draftId)
    .eq("created_by", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read submission draft: ${error.message}`);
  return data ? toDraft(data as unknown as DraftRow) : null;
}

/**
 * Step 1 — writes what was fetched from the source.
 *
 * Creates the draft on first import and overwrites it when the
 * contributor pastes a different URL into the same wizard, rather than
 * leaving a trail of abandoned drafts behind every correction. Re-importing
 * resets `details_completed`: the tech stack and description belong to
 * the old repository and would otherwise be carried onto a different one.
 */
export async function saveSubmissionDraftSource(
  supabase: SupabaseClient,
  userId: string,
  kind: SubmissionKind,
  source: SubmissionDraftSource,
  draftId?: string,
): Promise<SubmissionDraft> {
  const values = {
    created_by: userId,
    kind,
    source_url: source.url,
    source_name: source.name,
    repository_full_name: source.repositoryFullName,
    fetched_description: source.fetchedDescription,
    readme: source.readme,
    primary_language: source.primaryLanguage,
    detected_tech_stack: source.detectedTechStack,
    // The detected stack seeds step 2 so the contributor edits a real
    // starting point instead of an empty field.
    tech_stack: source.detectedTechStack,
    source_completed: true,
    details_completed: false,
    updated_at: new Date().toISOString(),
  };

  const query = draftId
    ? supabase
        .from("user_submission_drafts")
        .update(values)
        .eq("id", draftId)
        .eq("created_by", userId)
        .select(DRAFT_COLUMNS)
        .maybeSingle()
    : supabase
        .from("user_submission_drafts")
        .insert(values)
        .select(DRAFT_COLUMNS)
        .single();

  const { data, error } = await query;
  if (error) throw new Error(`Failed to save submission source: ${error.message}`);
  if (!data) throw new Error("Failed to save submission source: draft not found");

  return toDraft(data as unknown as DraftRow);
}

/**
 * Step 2 — the contributor's own choices.
 *
 * `details_completed` is set here, by the server, from the values it
 * just stored — not from a flag the client sent. Validation of those
 * values happens in the route with zod before this is reached, and again
 * in `complete_user_submission` before anything is published, so a
 * client that skips the wizard entirely still can't publish an
 * incomplete row.
 */
export async function saveSubmissionDraftDetails(
  supabase: SupabaseClient,
  draftId: string,
  userId: string,
  details: SubmissionDraftDetails,
): Promise<SubmissionDraft | null> {
  const { data, error } = await supabase
    .from("user_submission_drafts")
    .update({
      description_source: details.descriptionSource,
      custom_description: details.customDescription,
      tech_stack: details.techStack,
      is_paid_alternative: details.isPaidAlternative,
      alternative_to: details.alternativeTo,
      details_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("created_by", userId)
    .select(DRAFT_COLUMNS)
    .maybeSingle();

  if (error) throw new Error(`Failed to save submission details: ${error.message}`);
  return data ? toDraft(data as unknown as DraftRow) : null;
}

export interface CompletedSubmission {
  id: string;
  slug: string;
  name: string;
}

/**
 * Step 3 — publishes the draft, or explains why it can't be.
 *
 * Every check lives inside `devtunnel.complete_user_submission()`
 * (sql/028), not here: it locks the draft row, so two confirms racing
 * each other can't both insert, and re-running it after success returns
 * the row already created rather than a second one. This function's only
 * job is turning the function's error codes into something the route can
 * map to an HTTP status — a failed publish must never read as a generic
 * 500 when the real answer is "you skipped a step" or "someone already
 * submitted this".
 */
export type CompleteSubmissionResult =
  | { status: "ok"; submission: CompletedSubmission }
  | { status: "not_found" }
  | { status: "already_submitted" }
  | { status: "incomplete"; reason: string };

export async function completeSubmissionDraft(
  supabase: SupabaseClient,
  draftId: string,
  userId: string,
): Promise<CompleteSubmissionResult> {
  const { data, error } = await supabase.rpc("complete_user_submission", {
    p_draft_id: draftId,
    p_user_id: userId,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("draft_not_found") || message.includes("draft_not_owned")) {
      return { status: "not_found" };
    }
    if (message.includes("already_submitted")) {
      return { status: "already_submitted" };
    }
    if (
      message.includes("source_incomplete") ||
      message.includes("details_incomplete") ||
      message.includes("custom_description_required") ||
      message.includes("tech_stack_required") ||
      message.includes("alternative_to_required")
    ) {
      return { status: "incomplete", reason: message };
    }
    throw new Error(`Failed to complete submission: ${message}`);
  }

  // The function returns the row; Supabase hands back either the row or
  // a one-element array depending on how it resolves the return type.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { id: string; slug: string; name: string }
    | undefined;

  if (!row) return { status: "not_found" };

  return { status: "ok", submission: { id: row.id, slug: row.slug, name: row.name } };
}