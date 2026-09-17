import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A contributor's checklist progress on the Contribute page —
 * `devtunnel.contribution_progress` (sql/027).
 *
 * One module covering both catalogs, the same shape
 * src/db/catalogMemberships.ts uses for "has this viewer joined?" (rule
 * 51). The two owners differ only in which column holds the id, so a
 * descriptor keeps that difference in one place instead of duplicating
 * every query.
 *
 * What these rows are, and aren't, is spelled out in sql/027's header:
 * a private scratchpad, never a record of work done. Nothing here feeds
 * a contributor statistic, and nothing here is readable by another
 * contributor — every query below is scoped to one `userId`.
 */

interface ProgressOwner {
  /** The column holding the owning entity's id. */
  column: "project_id" | "tool_id";
  /** Conflict target for the upsert, matching the partial unique indexes in sql/027. */
  onConflict: "user_id,project_id" | "user_id,tool_id";
}

const PROJECT_OWNER: ProgressOwner = {
  column: "project_id",
  onConflict: "user_id,project_id",
};

const TOOL_OWNER: ProgressOwner = {
  column: "tool_id",
  onConflict: "user_id,tool_id",
};

const TABLE = "contribution_progress";

export interface ContributionProgress {
  /** Opaque step ids the contributor has ticked. Empty when they've ticked nothing. */
  completedSteps: string[];
  /** `null` when no row exists yet — nothing has ever been saved. */
  updatedAt: string | null;
}

/** Nothing saved yet. Returned rather than `null` so callers never branch on absence. */
const EMPTY_PROGRESS: ContributionProgress = { completedSteps: [], updatedAt: null };

/**
 * Explicit column list, never `select("*")` (rule 23). `maybeSingle()`
 * because "this contributor has never ticked anything here" is the
 * common case on a page most people open once, not an error.
 */
async function read(
  supabase: SupabaseClient,
  owner: ProgressOwner,
  ownerId: string,
  userId: string,
): Promise<ContributionProgress> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("completed_steps, updated_at")
    .eq(owner.column, ownerId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`Failed to read ${TABLE}: ${error.message}`);
  if (!data) return EMPTY_PROGRESS;

  return {
    // Defensive: a text[] column comes back as an array, but a row
    // written by hand or by a future migration shouldn't be able to put
    // a non-array into a response (rule 73).
    completedSteps: Array.isArray(data.completed_steps) ? data.completed_steps : [],
    updatedAt: data.updated_at,
  };
}

/**
 * Replaces the whole set of ticked steps, creating the row on first save.
 *
 * Replace rather than append/remove per step: the checklist is small and
 * fully visible on screen, so the client always knows the complete state,
 * and a single idempotent write means a double-click, a retry, or two
 * tabs racing all converge on the same row rather than interleaving into
 * a set nobody chose (rule 55). Last write wins, which is the right
 * outcome for one person's own scratchpad.
 *
 * `updated_at` is set explicitly because the column's default only
 * applies on insert — without this, an updated row would keep claiming
 * the time it was first created.
 *
 * Caller-side validation (bounded length, bounded id size) happens in the
 * route with zod before this is reached; this module never trusts an
 * unbounded array into the database (rule 67).
 */
async function save(
  supabase: SupabaseClient,
  owner: ProgressOwner,
  ownerId: string,
  userId: string,
  completedSteps: string[],
): Promise<ContributionProgress> {
  const updatedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        [owner.column]: ownerId,
        user_id: userId,
        completed_steps: completedSteps,
        updated_at: updatedAt,
      },
      { onConflict: owner.onConflict },
    )
    .select("completed_steps, updated_at")
    .single();

  if (error) throw new Error(`Failed to save ${TABLE}: ${error.message}`);

  return {
    completedSteps: Array.isArray(data.completed_steps) ? data.completed_steps : [],
    updatedAt: data.updated_at,
  };
}

/** Backs `GET /projects/:slug/contribute`. */
export function readProjectProgress(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<ContributionProgress> {
  return read(supabase, PROJECT_OWNER, projectId, userId);
}

/** Backs `PUT /projects/:slug/contribute/progress`. */
export function saveProjectProgress(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  completedSteps: string[],
): Promise<ContributionProgress> {
  return save(supabase, PROJECT_OWNER, projectId, userId, completedSteps);
}

/** Backs `GET /opensource-tools/:slug/contribute`. */
export function readToolProgress(
  supabase: SupabaseClient,
  toolId: string,
  userId: string,
): Promise<ContributionProgress> {
  return read(supabase, TOOL_OWNER, toolId, userId);
}

/** Backs `PUT /opensource-tools/:slug/contribute/progress`. */
export function saveToolProgress(
  supabase: SupabaseClient,
  toolId: string,
  userId: string,
  completedSteps: string[],
): Promise<ContributionProgress> {
  return save(supabase, TOOL_OWNER, toolId, userId, completedSteps);
}