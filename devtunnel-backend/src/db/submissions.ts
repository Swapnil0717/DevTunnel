import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Community submissions — `devtunnel.user_submission_list` and
 * `devtunnel.user_submission_upvotes` (sql/028).
 *
 * Backs `GET /submissions` and the two upvote routes
 * (src/routes/submissions.ts). Reads the view, not the base table, for
 * the same reason src/db/tasks.ts reads `admin_task_list`: the upvote
 * counts the sorts depend on are defined once, in SQL, rather than
 * recomputed slightly differently by every caller.
 *
 * What a row here is NOT: an onboarded DevTunnel project. See sql/028's
 * header — a submission is something a contributor pointed at, and
 * nothing in this module lets one reach `devtunnel.projects` or any
 * task-matching query.
 */

export type SubmissionKind = "PROJECT" | "TOOL";
export type SubmissionSort = "new" | "trending" | "popular";

/**
 * The "All projects / Alternative to paid software" cut on the list page.
 * Deliberately one filter, not two checkboxes: "a tool that replaces
 * something you pay for" is the axis people browse by, and it's
 * orthogonal to project-vs-tool, which is why both are offered.
 */
export type SubmissionCategory = "ALL" | "PROJECT" | "TOOL" | "PAID_ALTERNATIVE";

export interface SubmissionSummary {
  id: string;
  slug: string;
  kind: SubmissionKind;
  name: string;
  /** The description DevTunnel shows: the custom one when the submitter wrote one, else the fetched one. */
  description: string | null;
  /** Always the fetched description, even when a custom one is showing — the card can show both. */
  fetchedDescription: string | null;
  sourceUrl: string;
  repositoryFullName: string | null;
  primaryLanguage: string | null;
  techStack: string[];
  isPaidAlternative: boolean;
  alternativeTo: string[];
  submittedBy: {
    id: string;
    username: string;
    name: string | null;
    avatarUrl: string | null;
    profileUrl: string | null;
  };
  createdAt: string;
  upvoteCount: number;
  /** Upvotes in the last 7 days — what "Trending" orders by. */
  recentUpvoteCount: number;
  /** Per-viewer, layered on by `markViewerUpvotes` — never cached with the row. */
  upvotedByViewer: boolean;
}

/**
 * Upper bound on one list read. The page filters by tech stack in the
 * browser over what it was given rather than paging (same shape
 * `listAvailableProjects` uses), so one bounded read is the right size
 * (rule 67). If the community list ever outgrows this, it needs cursor
 * pagination, not a bigger number.
 */
const SUBMISSIONS_LIMIT = 200;

interface SubmissionRow {
  id: string;
  slug: string;
  kind: SubmissionKind;
  name: string;
  source_url: string;
  repository_full_name: string | null;
  fetched_description: string | null;
  custom_description: string | null;
  description_source: "EXISTING" | "CUSTOM";
  primary_language: string | null;
  tech_stack: string[] | null;
  is_paid_alternative: boolean;
  alternative_to: string[] | null;
  submitted_by: string;
  submitted_by_username: string | null;
  submitted_by_name: string | null;
  submitted_by_avatar_url: string | null;
  submitted_by_profile_url: string | null;
  created_at: string;
  upvote_count: number;
  recent_upvote_count: number;
}

/** Explicit column list, never `select("*")` (rule 23). */
const LIST_COLUMNS = [
  "id",
  "slug",
  "kind",
  "name",
  "source_url",
  "repository_full_name",
  "fetched_description",
  "custom_description",
  "description_source",
  "primary_language",
  "tech_stack",
  "is_paid_alternative",
  "alternative_to",
  "submitted_by",
  "submitted_by_username",
  "submitted_by_name",
  "submitted_by_avatar_url",
  "submitted_by_profile_url",
  "created_at",
  "upvote_count",
  "recent_upvote_count",
].join(", ");

function toSummary(row: SubmissionRow): SubmissionSummary {
  const custom = row.custom_description?.trim();

  return {
    id: row.id,
    slug: row.slug,
    kind: row.kind,
    name: row.name,
    // CUSTOM only wins when there's actually custom text behind it — a
    // row whose choice says CUSTOM but whose text is empty falls back to
    // what was fetched rather than showing nothing (rule 73).
    description:
      row.description_source === "CUSTOM" && custom ? custom : row.fetched_description,
    fetchedDescription: row.fetched_description,
    sourceUrl: row.source_url,
    repositoryFullName: row.repository_full_name,
    primaryLanguage: row.primary_language,
    techStack: Array.isArray(row.tech_stack) ? row.tech_stack : [],
    isPaidAlternative: row.is_paid_alternative,
    alternativeTo: Array.isArray(row.alternative_to) ? row.alternative_to : [],
    submittedBy: {
      id: row.submitted_by,
      username: row.submitted_by_username ?? "unknown",
      name: row.submitted_by_name,
      avatarUrl: row.submitted_by_avatar_url,
      profileUrl: row.submitted_by_profile_url || null,
    },
    createdAt: row.created_at,
    upvoteCount: row.upvote_count,
    recentUpvoteCount: row.recent_upvote_count,
    upvotedByViewer: false,
  };
}

export interface ListSubmissionsOptions {
  sort: SubmissionSort;
  category: SubmissionCategory;
  /** Show only submissions carrying every one of these tags. Empty means no tech filter. */
  techStack: string[];
  /** Free-text match on the name. Empty means no search. */
  query: string;
}

/**
 * The community list, sorted and filtered server-side.
 *
 * Sorting happens here rather than in the browser because the list is
 * capped: taking the newest 200 and then re-sorting them by upvotes in
 * the client would silently answer "most popular of the 200 newest",
 * which is a different question from the one the filter asks (rule 38).
 *
 * Every sort breaks ties on `created_at desc`, matching the view's own
 * documented ordering, so the result is stable between requests.
 */
export async function listSubmissions(
  supabase: SupabaseClient,
  options: ListSubmissionsOptions,
): Promise<SubmissionSummary[]> {
  let query = supabase.from("user_submission_list").select(LIST_COLUMNS);

  if (options.category === "PROJECT" || options.category === "TOOL") {
    query = query.eq("kind", options.category);
  } else if (options.category === "PAID_ALTERNATIVE") {
    query = query.eq("is_paid_alternative", true);
  }

  if (options.techStack.length > 0) {
    // `contains` → the `@>` operator, which the GIN index in sql/028
    // serves: every listed tag must be present, not any of them.
    query = query.contains("tech_stack", options.techStack);
  }

  if (options.query.trim()) {
    // `ilike` on the name only. Searching the README too would mean a
    // sequential scan over every stored README on every keystroke, for
    // matches nobody can see in the result row.
    query = query.ilike("name", `%${options.query.trim()}%`);
  }

  if (options.sort === "popular") {
    query = query.order("upvote_count", { ascending: false });
  } else if (options.sort === "trending") {
    query = query.order("recent_upvote_count", { ascending: false });
  }
  query = query.order("created_at", { ascending: false }).limit(SUBMISSIONS_LIMIT);

  const { data, error } = await query;
  if (error) throw new Error(`Failed to list submissions: ${error.message}`);

  return (data as unknown as SubmissionRow[]).map(toSummary);
}

/**
 * Layers "did I upvote this" onto an already-read page.
 *
 * One query for the whole page rather than one per row, and kept
 * separate from `listSubmissions` because it's the only per-viewer part
 * of the payload — the same split every catalog route in this backend
 * uses to keep the shared half cacheable and the personal half not.
 */
export async function markViewerUpvotes(
  supabase: SupabaseClient,
  submissions: SubmissionSummary[],
  userId: string,
): Promise<SubmissionSummary[]> {
  if (submissions.length === 0) return submissions;

  const { data, error } = await supabase
    .from("user_submission_upvotes")
    .select("submission_id")
    .eq("user_id", userId)
    .in(
      "submission_id",
      submissions.map((submission) => submission.id),
    );

  if (error) throw new Error(`Failed to read upvotes: ${error.message}`);

  const upvoted = new Set((data ?? []).map((row) => row.submission_id as string));
  return submissions.map((submission) => ({
    ...submission,
    upvotedByViewer: upvoted.has(submission.id),
  }));
}

/** One published submission by slug, or `null` — which the routes turn into a 404. */
export async function getSubmissionBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<{ id: string; slug: string; name: string } | null> {
  const { data, error } = await supabase
    .from("user_submissions")
    .select("id, slug, name")
    .eq("slug", slug)
    .is("removed_at", null)
    .maybeSingle();

  if (error) throw new Error(`Failed to read submission: ${error.message}`);
  return data ?? null;
}

export interface SubmissionUpvoteStatus {
  upvotedByViewer: boolean;
  upvoteCount: number;
}

/** Current count for one submission, read after a vote so the button never guesses. */
async function countUpvotes(supabase: SupabaseClient, submissionId: string): Promise<number> {
  const { count, error } = await supabase
    .from("user_submission_upvotes")
    .select("user_id", { count: "exact", head: true })
    .eq("submission_id", submissionId);

  if (error) throw new Error(`Failed to count upvotes: ${error.message}`);
  return count ?? 0;
}

/**
 * Idempotent upvote. `ignoreDuplicates` against the composite primary
 * key means a double-click or a retry resolves to the same single row
 * rather than an error the client would have to special-case (rule 55),
 * and the original `created_at` is preserved — re-clicking never moves a
 * submission back into the trending window.
 */
export async function upvoteSubmission(
  supabase: SupabaseClient,
  submissionId: string,
  userId: string,
): Promise<SubmissionUpvoteStatus> {
  const { error } = await supabase
    .from("user_submission_upvotes")
    .upsert(
      { submission_id: submissionId, user_id: userId },
      { onConflict: "submission_id,user_id", ignoreDuplicates: true },
    );

  if (error) throw new Error(`Failed to upvote: ${error.message}`);

  return { upvotedByViewer: true, upvoteCount: await countUpvotes(supabase, submissionId) };
}

/** The reverse. Deleting a row that isn't there is not an error — the end state is what was asked for. */
export async function removeSubmissionUpvote(
  supabase: SupabaseClient,
  submissionId: string,
  userId: string,
): Promise<SubmissionUpvoteStatus> {
  const { error } = await supabase
    .from("user_submission_upvotes")
    .delete()
    .eq("submission_id", submissionId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to remove upvote: ${error.message}`);

  return { upvotedByViewer: false, upvoteCount: await countUpvotes(supabase, submissionId) };
}