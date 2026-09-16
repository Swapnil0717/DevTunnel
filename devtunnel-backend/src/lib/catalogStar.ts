import type { getEnv } from "../config/env";
import { getSupabase } from "./supabase";
import { getValidGithubAccessToken } from "../db/githubTokens";
import { addGithubStar, removeGithubStar, getGithubStarStatus, type GithubStarStatus } from "../db/githubStars";
import {
  starRepositoryForUser,
  unstarRepositoryForUser,
  GitHubRepoError,
} from "./githubRepo";

/**
 * The star/unstar half of a Detail page's star button, shared by the two
 * curated-catalog routes added alongside it:
 * `PUT|DELETE /projects/:slug/star` (src/routes/projects.ts) and
 * `PUT|DELETE /opensource-tools/:slug/star` (src/routes/openSourceTools.ts).
 *
 * The sequence here is the same one `PUT /github-projects/:slug/star`
 * (src/routes/githubProjects.ts) established, and its reasoning carries
 * over unchanged: star on the contributor's own real GitHub account
 * first, using their own stored OAuth token — never a shared server
 * credential, since a star has to be attributable to the actual GitHub
 * user — and only then record the local `github_stars` row. A local row
 * with no matching real star would be a lie about what happened on the
 * contributor's account (rule 21).
 *
 * Extracted rather than copy-pasted a third and fourth time (rule 51).
 * The two existing GitHub-catalog routes still carry their own inline
 * copies; they can be migrated onto this helper in a follow-up, which is
 * a behavior-neutral refactor and so deliberately not bundled into this
 * change (rule 4: don't touch working functionality while shipping
 * something else).
 *
 * Returns a discriminated result rather than writing a response itself.
 * Each route already has its own error vocabulary — "this project isn't
 * on DevTunnel" versus "this tool isn't on DevTunnel" — and its own
 * logging tags, so mapping stays at the call site where that context
 * lives.
 */

export type CatalogStarAction = "star" | "unstar";

export type CatalogStarResult =
  | { status: "ok"; star: GithubStarStatus }
  /** No live GitHub connection — the route responds 403 `github_reauth_required`. */
  | { status: "reauth_required" }
  /** GitHub itself refused or was unreachable; `error.reason` drives the status code. */
  | { status: "github_error"; error: GitHubRepoError };

export interface CatalogStarInput {
  userId: string;
  owner: string;
  repo: string;
  action: CatalogStarAction;
}

export async function applyCatalogStar(
  env: ReturnType<typeof getEnv>,
  { userId, owner, repo, action }: CatalogStarInput,
): Promise<CatalogStarResult> {
  const supabase = getSupabase(env);
  const repositoryFullName = `${owner}/${repo}`;

  const accessToken = await getValidGithubAccessToken(supabase, env, userId);
  if (!accessToken) {
    return { status: "reauth_required" };
  }

  try {
    if (action === "star") {
      await starRepositoryForUser(accessToken, owner, repo);
      await addGithubStar(supabase, {
        repositoryFullName,
        repositoryUrl: `https://github.com/${repositoryFullName}`,
        starredBy: userId,
      });
    } else {
      await unstarRepositoryForUser(accessToken, owner, repo);
      await removeGithubStar(supabase, repositoryFullName, userId);
    }
  } catch (err) {
    if (err instanceof GitHubRepoError) {
      // A dead token surfaces from GitHub as `unauthorized` rather than
      // from the lookup above, so it's folded into the same
      // reconnect-prompt outcome here instead of reaching the caller as
      // a generic GitHub failure.
      if (err.reason === "unauthorized") return { status: "reauth_required" };
      return { status: "github_error", error: err };
    }
    throw err;
  }

  const star = await getGithubStarStatus(supabase, repositoryFullName, userId);
  return { status: "ok", star };
}

/**
 * Local star status with no write — used by both Detail routes to fill
 * `isStarredByViewer` / `localStarCount` on the payload. A thin
 * re-export so a route reading star state doesn't have to reach past
 * this module into `db/githubStars.ts` for the read and use this module
 * for the write.
 */
export async function readCatalogStarStatus(
  env: ReturnType<typeof getEnv>,
  repositoryFullName: string,
  viewerId: string,
): Promise<GithubStarStatus> {
  return getGithubStarStatus(getSupabase(env), repositoryFullName, viewerId);
}