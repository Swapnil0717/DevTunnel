import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Backs the "Star" action on both `/github-projects/:slug` and
 * `/github-open-source-tools/:slug` (src/routes/githubProjects.ts,
 * src/routes/githubOpenSourceTools.ts) — see sql/025's doc comment for
 * why this is one shared table/module rather than one per catalog. A
 * row here is only ever written *after* the real GitHub star call
 * (`lib/githubRepo.ts` `starRepositoryForUser`/`unstarRepositoryForUser`)
 * already succeeded — this module never itself talks to GitHub, it's
 * purely the local "who starred what, through DevTunnel" record.
 */
export interface GithubStarRef {
  repositoryFullName: string;
  repositoryUrl: string;
  starredBy: string;
}

/**
 * Idempotent — starring a repository the same contributor already
 * starred through DevTunnel is a no-op, matching GitHub's own star
 * endpoint being idempotent (`starRepositoryForUser`'s doc comment).
 * `onConflict` targets the unique `(starred_by, repository_full_name)`
 * index (sql/025) so a repeat star never errors or duplicates a row.
 */
export async function addGithubStar(
  supabase: SupabaseClient,
  star: GithubStarRef,
): Promise<void> {
  const { error } = await supabase.from("github_stars").upsert(
    {
      repository_full_name: star.repositoryFullName,
      repository_url: star.repositoryUrl,
      starred_by: star.starredBy,
    },
    { onConflict: "starred_by,repository_full_name", ignoreDuplicates: true },
  );
  if (error) throw error;
}

/** Idempotent the same way `addGithubStar` is — unstarring an already-unstarred repo is a no-op. */
export async function removeGithubStar(
  supabase: SupabaseClient,
  repositoryFullName: string,
  starredBy: string,
): Promise<void> {
  const { error } = await supabase
    .from("github_stars")
    .delete()
    .eq("repository_full_name", repositoryFullName)
    .eq("starred_by", starredBy);
  if (error) throw error;
}

export interface GithubStarStatus {
  starredByViewer: boolean;
  localStarCount: number;
}

/**
 * Both halves a Detail page's star button needs in one round trip:
 * whether the current viewer has starred this repository through
 * DevTunnel, and how many DevTunnel contributors in total have. Two
 * plain queries rather than one clever aggregate — `github_stars_repo_idx`
 * (sql/025) keeps the count query cheap, and `head: true` on the
 * viewer check avoids pulling back a row just to test existence.
 */
export async function getGithubStarStatus(
  supabase: SupabaseClient,
  repositoryFullName: string,
  viewerId: string,
): Promise<GithubStarStatus> {
  const [viewerResult, countResult] = await Promise.all([
    supabase
      .from("github_stars")
      .select("id", { count: "exact", head: true })
      .eq("repository_full_name", repositoryFullName)
      .eq("starred_by", viewerId),
    supabase
      .from("github_stars")
      .select("id", { count: "exact", head: true })
      .eq("repository_full_name", repositoryFullName),
  ]);

  if (viewerResult.error) throw viewerResult.error;
  if (countResult.error) throw countResult.error;

  return {
    starredByViewer: (viewerResult.count ?? 0) > 0,
    localStarCount: countResult.count ?? 0,
  };
}