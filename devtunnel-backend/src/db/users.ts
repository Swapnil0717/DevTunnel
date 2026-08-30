import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthUser, UserRow } from "../types";
import type { GitHubIdentity } from "../lib/github";
import { randomToken } from "../lib/crypto";
import { logger } from "../lib/logger";

/**
 * Maps a full `devtunnel.users` row to the frontend-safe `AuthUser` shape.
 * `githubId` (internal lookup key) is deliberately excluded — see
 * devtunnel-frontend/src/lib/auth/types.ts and rule 9 (separate public and
 * private data).
 */
export function toAuthUser(row: UserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    name: row.name,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    githubUsername: row.github_username,
    githubProfileUrl: row.github_profile_url,
    role: row.role,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

/**
 * Creates the user on first sign-in, or refreshes their cached GitHub
 * profile fields + `last_login_at` on every subsequent sign-in. Keyed on
 * `github_id`, which is the only identifier we trust from the OAuth flow
 * (rule 50: never trust user-supplied identity without verification — this
 * value came from GitHub's own `/user` endpoint, not from the client).
 *
 * Falls back to a suffixed username on the rare unique-constraint
 * collision (a different account already holding that GitHub login as
 * their DevTunnel username) rather than failing the whole sign-in.
 */
export async function upsertUserFromGitHub(
  supabase: SupabaseClient,
  identity: GitHubIdentity,
): Promise<UserRow> {
  const baseFields = {
    email: identity.email,
    username: identity.githubUsername,
    name: identity.name,
    bio: identity.bio,
    avatar_url: identity.avatarUrl,
    github_id: identity.githubId,
    github_username: identity.githubUsername,
    github_profile_url: identity.githubProfileUrl,
    last_login_at: new Date().toISOString(),
  };

  const attempt = async (username: string) => {
    return supabase
      .from("users")
      .upsert(
        { ...baseFields, username },
        { onConflict: "github_id" },
      )
      .select()
      .single<UserRow>();
  };

  let { data, error } = await attempt(baseFields.username);

  if (error && error.code === "23505") {
    // Unique violation — almost certainly the `username` constraint, since
    // `github_id` is the upsert's own conflict target. Retry once with a
    // short random suffix rather than failing sign-in outright.
    logger.warn("username_collision_on_upsert", { githubUsername: identity.githubUsername });
    const fallbackUsername = `${identity.githubUsername}-${randomToken(3)}`;
    ({ data, error } = await attempt(fallbackUsername));
  }

  if (error || !data) {
    throw new Error(`Failed to upsert user: ${error?.message ?? "no row returned"}`);
  }

  return data;
}

export async function findUserById(
  supabase: SupabaseClient,
  id: string,
): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from("users")
    .select()
    .eq("id", id)
    .maybeSingle<UserRow>();

  if (error) throw new Error(`Failed to load user: ${error.message}`);
  return data;
}
