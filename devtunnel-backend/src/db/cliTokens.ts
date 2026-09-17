import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserRow } from "../types";
import { randomToken, sha256Hex } from "../lib/crypto";
import { getIsMaintainer } from "./devtunnelStats";

/**
 * How long a `dev login` token stays valid before the user has to run
 * `dev login` again. Long-lived by design — unlike the browser session
 * (sql/001 devtunnel.sessions, 30 days by default via SESSION_TTL_DAYS),
 * a CLI token is meant to sit in `~/.devtunnel/credentials.json` on a
 * contributor's machine for months, not be re-issued every browser
 * visit. Kept as a code constant rather than an env var for now, same as
 * everything else added by this change — the only two CLI commands that
 * exist yet are `dev login`/`dev logout`, so there's no other caller that
 * would need this to be configurable; promote to config/env.ts if/when
 * `dev start`/`dev test`/`dev submit` land and token lifetime needs
 * tuning without a redeploy.
 */
const CLI_TOKEN_TTL_DAYS = 180;

/**
 * Issues a new CLI bearer token for `userId` and stores only its SHA-256
 * hash (same posture as db/sessions.ts `createSession` — a database read
 * alone can never yield a usable token). Returns the raw token exactly
 * once; the caller (`POST /auth/cli/token`) hands it straight to the CLI,
 * which is the only place it's ever written to disk.
 */
export async function createCliToken(
  supabase: SupabaseClient,
  userId: string,
  label: string | null,
): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + CLI_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("cli_tokens").insert({
    user_id: userId,
    token_hash: tokenHash,
    label,
    expires_at: expiresAt,
  });

  if (error) throw new Error(`Failed to create CLI token: ${error.message}`);
  return token;
}

/**
 * Revokes a CLI token by its raw value (deletes the row, not just a flag —
 * matches db/sessions.ts `revokeSessionByToken`). Used by
 * `POST /auth/cli/logout`. Idempotent: revoking a token that doesn't
 * exist (already revoked, already expired and swept, or simply wrong) is
 * not an error — logout must never fail from the caller's point of view.
 */
export async function revokeCliTokenByToken(supabase: SupabaseClient, token: string): Promise<void> {
  const tokenHash = await sha256Hex(token);
  const { error } = await supabase.from("cli_tokens").delete().eq("token_hash", tokenHash);
  if (error) throw new Error(`Failed to revoke CLI token: ${error.message}`);
}

export interface CliTokenUser {
  user: UserRow;
  isMaintainer: boolean;
}

interface CliTokenRow {
  id: string;
  user_id: string;
  expires_at: string;
}

/**
 * The `Authorization: Bearer <token>` counterpart to
 * `getUserForSessionTokenWithMaintainerStatus` (db/sessions.ts) — same
 * shape, same "hash the raw token, look up the hash, never the raw
 * value" posture, same `isMaintainer` enrichment so a CLI-authenticated
 * request sees exactly the same `AuthUser` a cookie-authenticated one
 * would (src/middleware/auth.ts's `requireAuth` calls this when there's
 * no session cookie).
 *
 * Returns `null` for a token that doesn't exist, has expired, or whose
 * user no longer exists — `requireAuth` treats every one of those the
 * same as "not signed in" (401), never a 500.
 */
export async function getUserForCliTokenWithMaintainerStatus(
  supabase: SupabaseClient,
  token: string,
): Promise<CliTokenUser | null> {
  const tokenHash = await sha256Hex(token);

  const { data: cliToken, error } = await supabase
    .from("cli_tokens")
    .select("id, user_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle<CliTokenRow>();

  if (error) throw new Error(`Failed to look up CLI token: ${error.message}`);
  if (!cliToken) return null;
  if (new Date(cliToken.expires_at).getTime() <= Date.now()) return null;

  const [userResult, isMaintainer] = await Promise.all([
    supabase.from("users").select().eq("id", cliToken.user_id).maybeSingle<UserRow>(),
    getIsMaintainer(supabase, cliToken.user_id),
  ]);

  if (userResult.error) {
    throw new Error(`Failed to load CLI token user: ${userResult.error.message}`);
  }
  if (!userResult.data) return null;

  // Best-effort touch, same pattern as the session equivalent — never
  // fails the request if this write fails.
  void supabase
    .from("cli_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", cliToken.id)
    .then(undefined, () => undefined);

  return { user: userResult.data, isMaintainer };
}