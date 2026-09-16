import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Contribute to this" membership for both curated catalogs —
 * `devtunnel.project_contributors` and
 * `devtunnel.opensource_tool_contributors` (sql/026).
 *
 * One module covering both tables rather than two near-identical ones
 * (rule 51): the two tables differ only in their name and their owning
 * column (`project_id` vs `tool_id`), and every caller wants the same
 * two operations — "has this viewer joined?" and "join, idempotently".
 * The `CatalogMembership` descriptor below is what keeps that difference
 * in one place instead of duplicating the queries.
 *
 * What a row here means, and does not mean, is spelled out at length in
 * sql/026's header: it records intent to work on something, never
 * delivered work. Nothing in this module feeds
 * `admin_project_list.devtunnel_contributor_count`, which counts
 * completed tasks and merged pull requests and moves only when work
 * actually lands (rule 38).
 */

interface CatalogMembership {
  /** Supabase table name, inside the `devtunnel` schema. */
  table: "project_contributors" | "opensource_tool_contributors";
  /** The column holding the joined entity's id. */
  ownerColumn: "project_id" | "tool_id";
}

const PROJECT_MEMBERSHIP: CatalogMembership = {
  table: "project_contributors",
  ownerColumn: "project_id",
};

const TOOL_MEMBERSHIP: CatalogMembership = {
  table: "opensource_tool_contributors",
  ownerColumn: "tool_id",
};

/**
 * `head: true` with an exact count — tests existence without pulling a
 * row back, same technique `getGithubStarStatus` (src/db/githubStars.ts)
 * uses for its own viewer check.
 */
async function isMember(
  supabase: SupabaseClient,
  membership: CatalogMembership,
  ownerId: string,
  userId: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from(membership.table)
    .select("user_id", { count: "exact", head: true })
    .eq(membership.ownerColumn, ownerId)
    .eq("user_id", userId);

  if (error) throw new Error(`Failed to read ${membership.table}: ${error.message}`);
  return (count ?? 0) > 0;
}

/**
 * Idempotent join. `ignoreDuplicates` against the composite primary key
 * means a double-click, a retried request, or a contributor who joined
 * months ago all resolve to the same single row rather than an error the
 * caller would have to special-case (rule 55). The original `joined_at`
 * is preserved — re-joining never quietly rewrites when someone actually
 * first joined.
 */
async function join(
  supabase: SupabaseClient,
  membership: CatalogMembership,
  ownerId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.from(membership.table).upsert(
    { [membership.ownerColumn]: ownerId, user_id: userId },
    { onConflict: `${membership.ownerColumn},user_id`, ignoreDuplicates: true },
  );

  if (error) throw new Error(`Failed to join ${membership.table}: ${error.message}`);
}

/** Has this viewer joined this project? Backs `DevtunnelProjectDetail.viewerIsContributing`. */
export function isProjectContributor(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<boolean> {
  return isMember(supabase, PROJECT_MEMBERSHIP, projectId, userId);
}

/** Backs `POST /projects/:slug/contribute`. */
export function joinProject(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<void> {
  return join(supabase, PROJECT_MEMBERSHIP, projectId, userId);
}

/** Has this viewer joined this tool? Backs `OpenSourceToolDetail.viewerIsContributing`. */
export function isOpenSourceToolContributor(
  supabase: SupabaseClient,
  toolId: string,
  userId: string,
): Promise<boolean> {
  return isMember(supabase, TOOL_MEMBERSHIP, toolId, userId);
}

/** Backs `POST /opensource-tools/:slug/contribute`. */
export function joinOpenSourceTool(
  supabase: SupabaseClient,
  toolId: string,
  userId: string,
): Promise<void> {
  return join(supabase, TOOL_MEMBERSHIP, toolId, userId);
}