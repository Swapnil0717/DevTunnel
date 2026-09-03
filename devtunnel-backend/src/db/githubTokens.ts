import type { SupabaseClient } from "@supabase/supabase-js";
import type { ValidatedEnv } from "../config/env";
import type { GitHubTokenBundle } from "../lib/github";
import { refreshAccessToken, GitHubOAuthError } from "../lib/github";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { logger } from "../lib/logger";

interface GithubTokenRow {
  github_access_token_encrypted: string | null;
  github_access_token_expires_at: string | null;
  github_refresh_token_encrypted: string | null;
  github_refresh_token_expires_at: string | null;
}

/** Refresh a bit before actual expiry so a request never races an in-flight expiry. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/**
 * Persists a user's GitHub token bundle, encrypted at rest
 * (src/lib/crypto.ts). Called after every successful GitHub sign-in
 * (routes/auth.ts) and after every successful refresh
 * (getValidGithubAccessToken below).
 */
export async function persistGithubTokens(
  supabase: SupabaseClient,
  env: ValidatedEnv,
  userId: string,
  tokens: GitHubTokenBundle,
): Promise<void> {
  const encryptedAccess = await encryptSecret(tokens.accessToken, env.GITHUB_TOKEN_ENCRYPTION_KEY);
  const encryptedRefresh = tokens.refreshToken
    ? await encryptSecret(tokens.refreshToken, env.GITHUB_TOKEN_ENCRYPTION_KEY)
    : null;

  const { error } = await supabase
    .from("users")
    .update({
      github_access_token_encrypted: encryptedAccess,
      github_access_token_expires_at: tokens.accessTokenExpiresAt,
      github_refresh_token_encrypted: encryptedRefresh,
      github_refresh_token_expires_at: tokens.refreshTokenExpiresAt,
    })
    .eq("id", userId);

  if (error) throw new Error(`Failed to persist GitHub tokens: ${error.message}`);
}

/** Clears stored tokens — used when GitHub reports a token as invalid/revoked. */
export async function clearGithubTokens(supabase: SupabaseClient, userId: string): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({
      github_access_token_encrypted: null,
      github_access_token_expires_at: null,
      github_refresh_token_encrypted: null,
      github_refresh_token_expires_at: null,
    })
    .eq("id", userId);

  if (error) throw new Error(`Failed to clear GitHub tokens: ${error.message}`);
}

/**
 * Returns a currently-valid GitHub user access token for this user,
 * transparently refreshing it first if it's expired/near-expiry and a
 * refresh token is available. Returns `null` when there is no usable
 * token — never signed in since this feature shipped, or the refresh
 * token itself has expired/been revoked — which callers (
 * src/routes/contributions.ts) must treat as "ask the user to reconnect
 * GitHub", not as an internal error (rule 21: errors are handled
 * explicitly, never swallowed into a false success).
 *
 * Only ever called with a `userId` sourced from the caller's own verified
 * session (never client-supplied) — see requireAuth usage in
 * routes/contributions.ts (rule 12/75).
 */
export async function getValidGithubAccessToken(
  supabase: SupabaseClient,
  env: ValidatedEnv,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "github_access_token_encrypted, github_access_token_expires_at, github_refresh_token_encrypted, github_refresh_token_expires_at",
    )
    .eq("id", userId)
    .maybeSingle<GithubTokenRow>();

  if (error) throw new Error(`Failed to load GitHub tokens: ${error.message}`);
  if (!data || !data.github_access_token_encrypted) return null;

  const accessExpiresAt = data.github_access_token_expires_at
    ? new Date(data.github_access_token_expires_at).getTime()
    : null;
  // null expiry means the App isn't configured to expire user tokens —
  // treat as always valid until GitHub itself rejects it.
  const stillValid = accessExpiresAt === null || accessExpiresAt - REFRESH_MARGIN_MS > Date.now();

  if (stillValid) {
    return decryptSecret(data.github_access_token_encrypted, env.GITHUB_TOKEN_ENCRYPTION_KEY);
  }

  if (!data.github_refresh_token_encrypted) return null;

  const refreshExpiresAt = data.github_refresh_token_expires_at
    ? new Date(data.github_refresh_token_expires_at).getTime()
    : null;
  if (refreshExpiresAt !== null && refreshExpiresAt <= Date.now()) return null;

  try {
    const refreshToken = await decryptSecret(
      data.github_refresh_token_encrypted,
      env.GITHUB_TOKEN_ENCRYPTION_KEY,
    );
    const refreshed = await refreshAccessToken(env, refreshToken);
    await persistGithubTokens(supabase, env, userId, refreshed);
    return refreshed.accessToken;
  } catch (err) {
    if (err instanceof GitHubOAuthError) {
      // Refresh token expired/revoked — not an internal error, just means
      // re-auth is needed. Clear the dead tokens so future requests don't
      // keep retrying a refresh that will always fail the same way.
      logger.warn("github_token_refresh_failed", { userId, reason: err.reason });
      await clearGithubTokens(supabase, userId).catch((clearErr) =>
        logger.error("github_token_clear_failed", { userId, error: String(clearErr) }),
      );
      return null;
    }
    throw err;
  }
}