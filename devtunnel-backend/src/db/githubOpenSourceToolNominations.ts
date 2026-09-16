import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Backs `POST /github-open-source-tools/:slug/request-onboarding`
 * (src/routes/githubOpenSourceTools.ts) — a signed-in contributor
 * flagging a GitHub open-source tool they think is worth an Admin
 * running the real Project Onboarding flow (sql/006) on. Sibling of
 * `db/githubProjectNominations.ts` — identical shape and reasoning,
 * pointed at devtunnel.github_open_source_tool_nominations (sql/024)
 * instead of devtunnel.github_project_nominations (sql/023), since the
 * two catalogs (`/github-projects` vs. `/github-open-source-tools`)
 * are already independent (lib/githubCatalog.ts), and keeping their
 * nomination queues independent too means an Admin reviewing "tools
 * contributors flagged" never has to filter out project nominations
 * (or vice versa).
 */
export interface NewGithubToolNomination {
  repositoryFullName: string;
  repositoryUrl: string;
  requestedBy: string;
}

export type RecordToolNominationResult = "created" | "already-pending";

/**
 * Inserts a new nomination row, or reports back that one is already
 * awaiting review, instead of erroring — the partial unique index on
 * `(repository_full_name) where status = 'PENDING'` (sql/024) is what
 * actually enforces "one active nomination per repository at a time";
 * this function only needs to tell the caller which of the two
 * happened so the route can still respond 200 either way (rule 38: a
 * repeat nomination isn't a client error, it's a legitimate no-op).
 *
 * Supabase/Postgres reports a unique-violation as error code `23505` —
 * checked explicitly rather than swallowing every error, so a genuine
 * failure (bad connection, unexpected constraint) still surfaces to
 * the caller instead of being silently treated as "already pending".
 */
export async function recordGithubToolNomination(
  supabase: SupabaseClient,
  nomination: NewGithubToolNomination,
): Promise<RecordToolNominationResult> {
  const { error } = await supabase.from("github_open_source_tool_nominations").insert({
    repository_full_name: nomination.repositoryFullName,
    repository_url: nomination.repositoryUrl,
    requested_by: nomination.requestedBy,
  });

  if (!error) return "created";
  if (error.code === "23505") return "already-pending";
  throw error;
}