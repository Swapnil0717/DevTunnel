import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminToolDetail, AdminToolSummary, AdminToolUpdatePayload } from "../types";

/**
 * Explicit column list for `GET /admin/opensource-tools` — never
 * `select("*")` (Backend_Development_Rules.md rule 23). Selected directly
 * from `devtunnel.opensource_tools` (sql/017) — unlike
 * `devtunnel.admin_project_list`, there's no curated view for this table
 * yet, so this list is the one place deciding exactly what a list row
 * exposes.
 */
const LIST_COLUMNS = "id, slug, name, source_url, fetched_description, primary_language, labels, created_at";

/** Explicit column list for the detail-only fields, added on top of `LIST_COLUMNS`. */
const DETAIL_EXTRA_COLUMNS = "readme, description_source, custom_description, setup_guide";

/** Raw row shape for `LIST_COLUMNS` — never `select("*")` (rule 23). */
interface OpenSourceToolListRow {
  id: string;
  slug: string;
  name: string;
  source_url: string;
  fetched_description: string | null;
  primary_language: string | null;
  /** Raw jsonb — always a flat string array per sql/017's column default. */
  labels: unknown;
  created_at: string;
}

/** Raw row shape for `LIST_COLUMNS` + `DETAIL_EXTRA_COLUMNS`. */
interface OpenSourceToolDetailRow extends OpenSourceToolListRow {
  readme: string | null;
  description_source: "EXISTING" | "CUSTOM";
  custom_description: string | null;
  setup_guide: string;
}

/**
 * Normalizes the `labels` jsonb column into a flat `string[]` — defensive
 * only (the column default is `'[]'::jsonb` and every write path here
 * always stores a string array), but never trusts a database result
 * blindly (rule 73).
 */
function toLabels(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === "string") : [];
}

/**
 * Maps one row of `devtunnel.opensource_tools` (sql/017) to the
 * frontend-facing `AdminToolSummary` shape (devtunnel-frontend/src/lib/
 * admin/opensource-tools/types.ts).
 */
function toAdminToolSummary(row: OpenSourceToolListRow): AdminToolSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    sourceUrl: row.source_url,
    fetchedDescription: row.fetched_description,
    primaryLanguage: row.primary_language,
    labels: toLabels(row.labels),
    createdAt: row.created_at,
  };
}

/** Maps one full row (list + detail columns) to `AdminToolDetail`. */
function toAdminToolDetail(row: OpenSourceToolDetailRow): AdminToolDetail {
  return {
    ...toAdminToolSummary(row),
    readme: row.readme,
    descriptionChoice: row.description_source,
    customDescription: row.custom_description,
    setupGuide: row.setup_guide,
  };
}

export interface ListAdminOpenSourceToolsOptions {
  /** Max rows to return (already validated by the route's Zod schema). */
  limit: number;
  /** Keyset cursor — return rows strictly older than this `created_at`. */
  before: string | null;
}

export interface AdminOpenSourceToolsPage {
  tools: AdminToolSummary[];
  /** Pass as `before` on the next request to fetch the following page. `null` when there are no more rows. */
  nextCursor: string | null;
}

/**
 * Keyset-paginated (not offset-based) read of every published open source
 * tool, newest first — same pattern, and same reasoning, as
 * `listAdminProjects` (src/db/adminProjects.ts): this table only grows,
 * and an offset-based `LIMIT/OFFSET` gets slower and can skip/duplicate
 * rows as new tools are onboarded between page loads
 * (Backend_Development_Rules.md rule 21).
 *
 * Backs `GET /admin/opensource-tools`.
 */
export async function listAdminOpenSourceTools(
  supabase: SupabaseClient,
  options: ListAdminOpenSourceToolsOptions,
): Promise<AdminOpenSourceToolsPage> {
  let query = supabase
    .from("opensource_tools")
    .select(LIST_COLUMNS)
    .order("created_at", { ascending: false })
    // Fetch one extra row so we can tell whether another page exists
    // without a separate COUNT query.
    .limit(options.limit + 1);

  if (options.before) {
    query = query.lt("created_at", options.before);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to load admin open source tool list: ${error.message}`);

  const rows = (data ?? []) as OpenSourceToolListRow[];
  const hasMore = rows.length > options.limit;
  const page = hasMore ? rows.slice(0, options.limit) : rows;

  return {
    tools: page.map(toAdminToolSummary),
    nextCursor: hasMore ? (page[page.length - 1] as OpenSourceToolListRow).created_at : null,
  };
}

/**
 * Single-tool lookup used purely for existence checks (mirrors
 * `getAdminProjectById`'s role in `getAdminProjectDetailById`). Returns
 * `null` when no tool with that id exists — callers map that to a 404,
 * never a 500 (rule 17).
 */
export async function getAdminOpenSourceToolById(
  supabase: SupabaseClient,
  id: string,
): Promise<AdminToolSummary | null> {
  const { data, error } = await supabase
    .from("opensource_tools")
    .select(LIST_COLUMNS)
    .eq("id", id)
    .maybeSingle<OpenSourceToolListRow>();

  if (error) throw new Error(`Failed to load open source tool: ${error.message}`);
  return data ? toAdminToolSummary(data) : null;
}

/**
 * Full single-tool detail backing `GET /admin/opensource-tools/:id` and
 * the frontend's `AdminToolDetail` contract. Unlike
 * `getAdminProjectDetailById`, this is a single read against
 * `devtunnel.opensource_tools` directly — there's no separate curated
 * list view for this table (see `LIST_COLUMNS`'s comment above), so there
 * is no second table to race against between two reads.
 */
export async function getAdminOpenSourceToolDetailById(
  supabase: SupabaseClient,
  id: string,
): Promise<AdminToolDetail | null> {
  const { data, error } = await supabase
    .from("opensource_tools")
    .select(`${LIST_COLUMNS}, ${DETAIL_EXTRA_COLUMNS}`)
    .eq("id", id)
    .maybeSingle<OpenSourceToolDetailRow>();

  if (error) throw new Error(`Failed to load open source tool detail: ${error.message}`);
  return data ? toAdminToolDetail(data) : null;
}

/**
 * Errors `updateAdminOpenSourceTool` raises for update-specific business
 * rules, kept distinct from a generic thrown `Error` so the route handler
 * (src/routes/admin/opensourceTools.ts) can map it to the correct HTTP
 * status without string-matching a message — same pattern as
 * `AdminProjectUpdateError` (src/db/adminProjects.ts, rule 20).
 */
export class AdminOpenSourceToolUpdateError extends Error {
  code: "not_found";
  constructor(code: AdminOpenSourceToolUpdateError["code"], message: string) {
    super(message);
    this.name = "AdminOpenSourceToolUpdateError";
    this.code = code;
  }
}

/**
 * Applies a partial update to an already-published open source tool —
 * backs `PATCH /admin/opensource-tools/:id`.
 *
 * Deliberately restricted to exactly the fields `AdminToolUpdatePayload`
 * allows (description choice/custom description, labels, setup guide) —
 * `sourceUrl`, `fetchedDescription`, `primaryLanguage`, and `readme` stay
 * exactly what onboarding's Step 1 import resolved and have no writable
 * path here, same restriction `updateAdminProject` enforces for
 * GitHub-derived project fields.
 *
 * `descriptionChoice`/`customDescription` write to the differently-named
 * `description_source`/`custom_description` columns (sql/017) — mapped
 * explicitly here rather than assumed. `labels` and `setupGuide` are
 * simple column writes. Only columns actually present in `input` are
 * included in the update (a true partial patch) — an update with only
 * `labels` set, for example, never touches `description_source`.
 *
 * There is no soft-delete state to guard against here (unlike
 * `updateAdminProject`'s `deleted_at` check) — see "Delete semantics" in
 * this feature's task notes for why `devtunnel.opensource_tools` has no
 * such column. `.select().maybeSingle()` on the update itself is what
 * tells "row didn't exist" apart from a successful write, closing the
 * same race `updateAdminProject` guards against with its own
 * `.is("deleted_at", null)` — here a concurrent delete between validation
 * and this write simply surfaces as a normal not-found.
 */
export async function updateAdminOpenSourceTool(
  supabase: SupabaseClient,
  id: string,
  input: AdminToolUpdatePayload,
): Promise<AdminToolDetail> {
  const values: Record<string, unknown> = {};

  if (input.descriptionChoice !== undefined) {
    values.description_source = input.descriptionChoice;
  }
  if (input.customDescription !== undefined) {
    values.custom_description = input.customDescription;
  }
  if (input.labels !== undefined) {
    values.labels = input.labels;
  }
  if (input.setupGuide !== undefined) {
    values.setup_guide = input.setupGuide;
  }

  const { data, error } = await supabase
    .from("opensource_tools")
    .update(values)
    .eq("id", id)
    .select(`${LIST_COLUMNS}, ${DETAIL_EXTRA_COLUMNS}`)
    .maybeSingle<OpenSourceToolDetailRow>();

  if (error) throw new Error(`Failed to update open source tool: ${error.message}`);
  if (!data) {
    throw new AdminOpenSourceToolUpdateError("not_found", "Open source tool not found");
  }

  return toAdminToolDetail(data);
}

/**
 * Errors `deleteAdminOpenSourceTool` raises for delete-specific business
 * rules, kept distinct from a generic thrown `Error` — same pattern as
 * `AdminProjectDeleteError` (rule 20).
 *
 * Unlike `AdminProjectDeleteError`, there is no `already_deleted` code:
 * this is a hard delete (see "Delete semantics" in this feature's task
 * notes), so there's no distinguishable "already deleted" state to
 * report separately from "never existed" — both are a plain `not_found`.
 */
export class AdminOpenSourceToolDeleteError extends Error {
  code: "not_found";
  constructor(code: AdminOpenSourceToolDeleteError["code"], message: string) {
    super(message);
    this.name = "AdminOpenSourceToolDeleteError";
    this.code = code;
  }
}

/** Result of a successful `deleteAdminOpenSourceTool` call, for the audit log entry. */
export interface DeleteAdminOpenSourceToolResult {
  id: string;
  slug: string;
  name: string;
}

/**
 * Hard-deletes an open source tool — backs `DELETE
 * /admin/opensource-tools/:id`.
 *
 * `devtunnel.opensource_tools` (sql/017) carries no `deleted_at`/
 * `delete_reason` columns and nothing downstream cascades destructively
 * from it: `opensource_tool_onboarding_drafts.completed_tool_id`
 * references this table `on delete set null` (sql/017), so removing a
 * tool only clears that pointer on its own onboarding draft — it never
 * fails and never deletes draft history. Unlike `devtunnel.projects`
 * (sql/004's `on delete cascade` from tasks/pull_requests, which is
 * exactly why `deleteAdminProject` never issues a physical delete), a
 * published tool carries no such history that a hard delete would
 * destroy, so a plain row delete is the right call here rather than
 * adding a soft-delete column and migration this feature doesn't need
 * (rule 5: only add the schema a feature actually needs).
 *
 * Reads the row first (rather than blind-deleting) purely to capture
 * `slug`/`name` for the audit log entry the caller records after a
 * successful delete — the row no longer exists to read afterward.
 */
export async function deleteAdminOpenSourceTool(
  supabase: SupabaseClient,
  id: string,
): Promise<DeleteAdminOpenSourceToolResult> {
  const { data: current, error: fetchError } = await supabase
    .from("opensource_tools")
    .select("id, slug, name")
    .eq("id", id)
    .maybeSingle<{ id: string; slug: string; name: string }>();

  if (fetchError) throw new Error(`Failed to load open source tool for delete: ${fetchError.message}`);
  if (!current) {
    throw new AdminOpenSourceToolDeleteError("not_found", "Open source tool not found");
  }

  const { error: deleteError } = await supabase.from("opensource_tools").delete().eq("id", id);
  if (deleteError) throw new Error(`Failed to delete open source tool: ${deleteError.message}`);

  return { id: current.id, slug: current.slug, name: current.name };
}