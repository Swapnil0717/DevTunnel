import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuthUser, OnboardingData, ProfileUpdateData, UserRow } from "../types";
import type { GitHubIdentity } from "../lib/github";
import { randomToken } from "../lib/crypto";
import { logger } from "../lib/logger";

/**
 * Maps a full `devtunnel.users` row to the frontend-safe `AuthUser` shape.
 * `githubId` (internal lookup key) is deliberately excluded — see
 * devtunnel-frontend/src/lib/auth/types.ts and rule 9 (separate public and
 * private data).
 *
 * `isMaintainer` isn't a column on this row — it's derived from
 * `devtunnel.project_maintainers` (db/devtunnelStats.ts `getIsMaintainer`)
 * and passed in by the caller, since that requires its own query. Callers
 * that don't need it (or haven't looked it up yet) can omit it; it
 * defaults to `false` rather than silently guessing "true".
 */
export function toAuthUser(row: UserRow, isMaintainer = false): AuthUser {
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
    onboardingCompleted: row.onboarding_completed,
    skills: row.skills,
    technologies: row.technologies,
    developerRoles: row.developer_roles,
    experienceLevel: row.experience_level,
    interests: row.interests,
    intent: row.intent,
    isMaintainer,
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

/**
 * Persists the onboarding wizard's answers (devtunnel_workflow.txt Module
 * C1 "User onboarding" screen) and marks the account onboarded. Only ever
 * called for the currently-authenticated user's own id — see
 * routes/auth.ts, where `userId` comes from `requireAuth`, never from the
 * request body (rule 12: authorization must be explicit and separate from
 * authentication).
 */
export async function completeOnboarding(
  supabase: SupabaseClient,
  userId: string,
  data: OnboardingData,
): Promise<UserRow> {
  const { data: row, error } = await supabase
    .from("users")
    .update({
      bio: data.bio.length > 0 ? data.bio : null,
      skills: data.skills,
      technologies: data.technologies,
      developer_roles: data.developerRoles,
      experience_level: data.experienceLevel,
      interests: data.interests,
      intent: data.intent,
      onboarding_completed: true,
    })
    .eq("id", userId)
    .select()
    .single<UserRow>();

  if (error || !row) {
    throw new Error(`Failed to update onboarding: ${error?.message ?? "no row returned"}`);
  }

  return row;
}

/**
 * Updates the account-settings-page-editable subset of a user's profile
 * (display name + bio). Only ever called for the currently-authenticated
 * user's own id — see routes/settings.ts, where `userId` comes from
 * `requireAuth`, never from the request body (rule 12: authorization must
 * be explicit and separate from authentication — same posture as
 * `completeOnboarding` above).
 *
 * Empty strings are normalized to `null` (matches `completeOnboarding`'s
 * treatment of `bio`), so clearing a field in the form actually clears the
 * column instead of persisting an empty string.
 */
export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  data: ProfileUpdateData,
): Promise<UserRow> {
  const { data: row, error } = await supabase
    .from("users")
    .update({
      name: data.name && data.name.length > 0 ? data.name : null,
      bio: data.bio && data.bio.length > 0 ? data.bio : null,
    })
    .eq("id", userId)
    .select()
    .single<UserRow>();

  if (error || !row) {
    throw new Error(`Failed to update profile: ${error?.message ?? "no row returned"}`);
  }

  return row;
}

export class DeleteAccountError extends Error {
  code: "not_found" | "already_deleted";

  constructor(code: "not_found" | "already_deleted", message: string) {
    super(message);
    this.name = "DeleteAccountError";
    this.code = code;
  }
}

export interface DeleteAccountResult {
  id: string;
  deletedAt: string;
}

/**
 * Soft-deletes the caller's own account — backs `DELETE /settings/account`.
 *
 * Delegates to the atomic `devtunnel.delete_own_account` Postgres function
 * (sql/035_add_settings.sql) so the existence check, already-deleted
 * check, and the `deleted_at` update happen in one transaction with the
 * row locked for the duration — same pattern as `deleteAdminProject` in
 * db/adminProjects.ts. Never issues a physical `DELETE`: other tables
 * (projects.created_by, tasks, submissions, ...) reference this user, and
 * a hard delete would either cascade away that history or fail outright
 * on the foreign keys that don't cascade (rule 85/86).
 *
 * Session revocation is deliberately NOT done here — it's a different
 * concern (sessions table, not users table) and the caller
 * (routes/settings.ts) already has the raw session token it needs to also
 * clear the browser's cookie, so it revokes every session for this user
 * right after this call succeeds.
 */
export async function deleteOwnAccount(
  supabase: SupabaseClient,
  userId: string,
): Promise<DeleteAccountResult> {
  const { data, error } = await supabase.rpc("delete_own_account", {
    p_user_id: userId,
  });

  if (error) {
    const message = error.message ?? "";
    if (message.includes("USER_NOT_FOUND")) {
      throw new DeleteAccountError("not_found", "Account not found");
    }
    if (message.includes("ACCOUNT_ALREADY_DELETED")) {
      throw new DeleteAccountError("already_deleted", "This account has already been deleted");
    }
    throw new Error(`Failed to delete account: ${error.message}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("delete_own_account returned no row");
  }
  return { id: row.id, deletedAt: row.deleted_at };
}