import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Contribute" on a repository that is still in one of the raw GitHub
 * catalogs — `devtunnel.github_repo_contributors` (sql/036).
 *
 * Those repositories aren't rows in `devtunnel.projects` /
 * `devtunnel.opensource_tools` yet, so `src/db/catalogMemberships.ts`
 * (sql/026, which foreign-keys to those tables) can't record the join. This
 * is its counterpart for the GitHub side, and it keeps the same semantics:
 * a row records *intent to work on something*, never delivered work, and
 * nothing here feeds a contributor count or the contribution calendar.
 *
 * Identified by `owner/repo` (lower-cased into `repository_key`), the same
 * way `github_stars` (sql/025) identifies a repository — there is no
 * DevTunnel id to use.
 */

export type GithubCatalog = "project" | "tool";

export interface GithubRepoJoin {
  userId: string;
  catalog: GithubCatalog;
  /** GitHub's own casing, e.g. `facebook/react`. */
  repositoryFullName: string;
  repositoryUrl: string;
}

/** Lower-cased `owner/repo` — the key both the write and the lookup use. */
export function toRepositoryKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}

/**
 * Idempotent join. `ignoreDuplicates` against the composite primary key
 * means a double-click, a retry, or a contributor who joined months ago all
 * resolve to the same single row, and the original `joined_at` is preserved
 * — re-joining never quietly rewrites when someone first joined (rule 55).
 */
export async function joinGithubRepo(
  supabase: SupabaseClient,
  join: GithubRepoJoin,
): Promise<void> {
  const { error } = await supabase.from("github_repo_contributors").upsert(
    {
      user_id: join.userId,
      catalog: join.catalog,
      repository_key: join.repositoryFullName.toLowerCase(),
      repository_full_name: join.repositoryFullName,
      repository_url: join.repositoryUrl,
    },
    { onConflict: "user_id,catalog,repository_key", ignoreDuplicates: true },
  );

  if (error) throw new Error(`Failed to join github_repo_contributors: ${error.message}`);
}

/**
 * Has this viewer joined this repository through this catalog? `head: true`
 * with an exact count tests existence without pulling a row back, same
 * technique `isMember` in `catalogMemberships.ts` uses.
 */
export async function isGithubRepoContributor(
  supabase: SupabaseClient,
  userId: string,
  catalog: GithubCatalog,
  repositoryKey: string,
): Promise<boolean> {
  const { count, error } = await supabase
    .from("github_repo_contributors")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("catalog", catalog)
    .eq("repository_key", repositoryKey);

  if (error) throw new Error(`Failed to read github_repo_contributors: ${error.message}`);
  return (count ?? 0) > 0;
}