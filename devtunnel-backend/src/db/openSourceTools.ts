import type { SupabaseClient } from "@supabase/supabase-js";
import { toLabels } from "./adminOpenSourceTools";
import { parseGithubRepoUrl } from "../lib/githubRepo";

/**
 * Contributor — Open Source Tools on DevTunnel (`/opensource-tools` —
 * "Open Source Tools on Devtunnel" in `AppSidebar`/`AppBottomNav`,
 * devtunnel-frontend's `lib/opensource-tools/{types,api}.ts`). Backs
 * `GET /opensource-tools/available` and `GET /opensource-tools/:slug`
 * (src/routes/openSourceTools.ts).
 *
 * Deliberately NOT the same data source as `GET /github-open-source-tools`
 * (src/routes/githubOpenSourceTools.ts): that route never touches
 * Supabase and lists every developer-tool-tagged repository across all of
 * GitHub. This reads `devtunnel.opensource_tools` (sql/017) directly —
 * the tools an admin has actually onboarded through the Open Source Tool
 * Onboarding wizard (`complete_opensource_tool_onboarding`) — DevTunnel's
 * own curated catalog, same "GitHub-wide catalog vs. DevTunnel's own
 * curated list" pairing `src/db/projects.ts` documents for Projects.
 *
 * Reads the base `devtunnel.opensource_tools` table directly rather than
 * a view — there is no curated view for this table yet (same note
 * `LIST_COLUMNS` in src/db/adminOpenSourceTools.ts already makes for the
 * Admin list) — with its own explicit column list, since the contributor
 * list needs the *resolved* description (`fetched_description` vs.
 * `custom_description`, gated by `description_source`) that the Admin
 * list's own `LIST_COLUMNS` doesn't select at all (see
 * `resolveDescription` below).
 */

/**
 * A single row of the contributor "Open Source Tools on Devtunnel" list —
 * mirrors `OpenSourceToolSummary` in
 * devtunnel-frontend/src/lib/opensource-tools/types.ts exactly.
 */
export interface OpenSourceToolSummary {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sourceUrl: string;
  primaryLanguage: string | null;
  labels: string[];
  createdAt: string;
}

/**
 * Raw row shape as read off `devtunnel.opensource_tools` by
 * `AVAILABLE_TOOL_COLUMNS` below. Every column here is confirmed to exist
 * on the table created by sql/017_add_opensource_tool_onboarding.sql.
 */
interface AvailableOpenSourceToolRow {
  id: string;
  slug: string;
  name: string;
  source_url: string;
  fetched_description: string | null;
  custom_description: string | null;
  description_source: "EXISTING" | "CUSTOM";
  primary_language: string | null;
  labels: unknown;
  created_at: string;
}

const AVAILABLE_TOOL_COLUMNS =
  "id, slug, name, source_url, fetched_description, custom_description, description_source, primary_language, labels, created_at";

/**
 * Upper bound on how many published tools one `GET /opensource-tools
 * /available` request reads. Same reasoning `AVAILABLE_PROJECTS_LIMIT`
 * documents in src/db/projects.ts: no keyset pagination on the frontend
 * side (`getOpenSourceTools` in devtunnel-frontend/src/lib/
 * opensource-tools/api.ts reads the response as one flat
 * `OpenSourceToolSummary[]`), and a tool only ever gets here by going
 * through the admin onboarding wizard one at a time, so this stays small
 * in practice — 500 is comfortably above any real installation today.
 */
const AVAILABLE_TOOLS_LIMIT = 500;

/**
 * The tool's resolved, contributor-facing description — mirrors exactly
 * what `OpenSourceToolSummary.description`'s own doc comment specifies:
 * "Resolved description (custom, falling back to the fetched repo
 * description) — or `null` if neither exists yet."
 *
 * Unlike `devtunnel.projects` (whose `description` column already holds
 * this exact resolution, computed once at onboarding-completion time by
 * `complete_project_onboarding` — sql/006/007), `devtunnel.opensource_tools`
 * has no equivalent pre-resolved column (sql/017's `create table` only
 * has `fetched_description` and `custom_description` alongside the
 * `description_source` flag), so this route resolves it the same way,
 * application-side, on every read — never trusts `description_source`
 * blindly for an empty/whitespace-only `custom_description` (rule 73),
 * falling back to `fetched_description` in that case instead of
 * returning a blank string.
 */
function resolveDescription(row: {
  description_source: "EXISTING" | "CUSTOM";
  custom_description: string | null;
  fetched_description: string | null;
}): string | null {
  if (row.description_source === "CUSTOM" && row.custom_description?.trim()) {
    return row.custom_description;
  }
  return row.fetched_description;
}

function toOpenSourceToolSummary(row: AvailableOpenSourceToolRow): OpenSourceToolSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: resolveDescription(row),
    sourceUrl: row.source_url,
    primaryLanguage: row.primary_language,
    labels: toLabels(row.labels),
    createdAt: row.created_at,
  };
}

/**
 * Every published DevTunnel open source tool, newest-onboarded-first,
 * mapped to the contributor-facing `OpenSourceToolSummary` shape. Backs
 * `GET /opensource-tools/available`.
 *
 * No `status`/`deleted_at` predicate here, unlike `listAvailableProjects`
 * (src/db/projects.ts): `devtunnel.opensource_tools` (sql/017) has
 * neither column — a tool is hard-deleted, not soft-deleted, once
 * published (see `deleteAdminOpenSourceTool`'s own "Delete semantics"
 * comment in src/db/adminOpenSourceTools.ts for why: it carries no
 * dependent history a hard delete would destroy, unlike a project's
 * tasks/pull requests). A row existing in this table at all means it is,
 * by definition, currently published and available.
 */
export async function listAvailableOpenSourceTools(
  supabase: SupabaseClient,
): Promise<OpenSourceToolSummary[]> {
  const { data, error } = await supabase
    .from("opensource_tools")
    .select(AVAILABLE_TOOL_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(AVAILABLE_TOOLS_LIMIT);

  if (error) throw new Error(`Failed to load available open source tools: ${error.message}`);

  const rows = (data ?? []) as unknown as AvailableOpenSourceToolRow[];
  return rows.map(toOpenSourceToolSummary);
}

/* ---------------------------------------------------------------------------
 * Single-tool detail — `GET /opensource-tools/:slug`
 * (src/routes/openSourceTools.ts), the Tool Detail page
 * devtunnel-frontend's `lib/opensource-tools/{types,api}.ts` calls.
 * ------------------------------------------------------------------------ */

/**
 * Everything the detail route reads out of Supabase for one tool: the
 * summary fields, plus the two columns only the detail view needs
 * (`readme`, `setup_guide`) and the resolved GitHub owner/repo when the
 * tool's `source_url` actually points at a repository.
 *
 * `repo` being `null` is a normal, expected state, not an error: sql/017
 * stores a `source_url`, not a repository, precisely because a tool's
 * home can be a docs site or a vendor page. The route uses that to decide
 * whether there's any GitHub data to fetch at all.
 */
export interface OpenSourceToolDetailRecord extends OpenSourceToolSummary {
  /** Imported at onboarding time (Step 1), never re-fetched on read. */
  readme: string | null;
  /** Admin-authored Markdown from Step 4 — never derived from `readme`. Always a string (sql/017 defaults it to ''). */
  setupGuide: string;
  /** Resolved from `source_url` — `null` when the tool isn't hosted on GitHub. */
  repo: { owner: string; repo: string } | null;
  /**
   * Slug of this tool's linked shadow project (sql/034), or `null` for a
   * tool onboarded before that migration — those simply have no linked
   * project yet, and this reads `null` rather than inventing one. This
   * is what `GET /opensource-tools/:slug` uses to pull the tool's real
   * DevTunnel tasks (`devtunnel.tasks` hangs off a project, never a tool
   * directly — sql/034's own header explains why).
   */
  projectSlug: string | null;
}

interface OpenSourceToolDetailRow extends AvailableOpenSourceToolRow {
  readme: string | null;
  setup_guide: string;
  project_id: string | null;
}

/** Explicit column list, never `select("*")` (rule 23). */
const DETAIL_TOOL_COLUMNS = `${AVAILABLE_TOOL_COLUMNS}, readme, setup_guide, project_id`;

/**
 * One published tool by slug, or `null` when no such tool exists — which
 * the route turns into a 404. There's no soft-delete or status column to
 * filter on here (see `listAvailableOpenSourceTools` above): a row
 * existing at all means the tool is published.
 *
 * `parseGithubRepoUrl` (src/lib/githubRepo.ts) is reused for the
 * owner/repo resolution rather than a second URL parser — it already
 * handles the https/ssh/bare `owner/repo` forms an admin might have
 * pasted during onboarding, and returns `null` for any non-GitHub host,
 * which is exactly the "this tool has no repository" signal the detail
 * route needs (rule 51).
 */
export async function getOpenSourceToolDetailBySlug(
  supabase: SupabaseClient,
  slug: string,
): Promise<OpenSourceToolDetailRecord | null> {
  const { data, error } = await supabase
    .from("opensource_tools")
    .select(DETAIL_TOOL_COLUMNS)
    .eq("slug", slug)
    .maybeSingle<OpenSourceToolDetailRow>();

  if (error) throw new Error(`Failed to load open source tool: ${error.message}`);
  if (!data) return null;

  // Second, cheap point lookup rather than a PostgREST embed — same
  // "two round trips, both hit a unique index" reasoning
  // `getProjectDetailBySlug` documents for its own project/counts split.
  // Skipped entirely for a pre-sql/034 tool with no project_id at all.
  let projectSlug: string | null = null;
  if (data.project_id) {
    const { data: projectRow, error: projectError } = await supabase
      .from("projects")
      .select("slug")
      .eq("id", data.project_id)
      .maybeSingle<{ slug: string }>();
    if (projectError) {
      throw new Error(`Failed to load tool's linked project: ${projectError.message}`);
    }
    projectSlug = projectRow?.slug ?? null;
  }

  return {
    ...toOpenSourceToolSummary(data),
    readme: data.readme,
    setupGuide: data.setup_guide ?? "",
    repo: parseGithubRepoUrl(data.source_url),
    projectSlug,
  };
}