import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Backs `POST /github-projects/:slug/request-onboarding`
 * (src/routes/githubProjects.ts) — a signed-in contributor flagging a
 * GitHub repository they think is worth an Admin running the real
 * Project Onboarding flow (sql/006) on. See sql/023 for the table this
 * reads/writes and why it's a much thinner shape than
 * devtunnel.ai_discovered_projects (sql/020): no AI-authored reasoning
 * or tech-stack guess, just "a contributor flagged this" and who.
 */
export interface NewGithubProjectNomination {
  repositoryFullName: string;
  repositoryUrl: string;
  requestedBy: string;
}

export type RecordNominationResult = "created" | "already-pending";

/**
 * Inserts a new nomination row, or reports back that one is already
 * awaiting review, instead of erroring — the partial unique index on
 * `(repository_full_name) where status = 'PENDING'` (sql/023) is what
 * actually enforces "one active nomination per repository at a time";
 * this function only needs to tell the caller which of the two
 * happened so the route can still respond 200 either way (rule 38: a
 * repeat nomination isn't a client error, it's a legitimate no-op).
 *
 * Supabase/Postgres reports a unique-violation as error code `23505` —
 * checked explicitly rather than swallowing every error, so a genuine
 * failure (bad connection, unexpected constraint) still surfaces to the
 * caller instead of being silently treated as "already pending".
 */
export async function recordGithubProjectNomination(
  supabase: SupabaseClient,
  nomination: NewGithubProjectNomination,
): Promise<RecordNominationResult> {
  const { error } = await supabase.from("github_project_nominations").insert({
    repository_full_name: nomination.repositoryFullName,
    repository_url: nomination.repositoryUrl,
    requested_by: nomination.requestedBy,
  });

  if (!error) return "created";
  if (error.code === "23505") return "already-pending";
  throw error;
}