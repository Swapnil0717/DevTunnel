import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionRow, UserRow } from "../types";
import { randomToken, sha256Hex } from "../lib/crypto";
import { getIsMaintainer } from "./devtunnelStats";

/**
 * Sessions are opaque server-side tokens, not stateless JWTs: the raw
 * token only ever lives in the httpOnly `dt_session` cookie, and only its
 * SHA-256 hash is stored in the database. This is what lets
 * `POST /auth/logout` actually revoke a session (a JWT can't be
 * invalidated without a denylist, which is the same problem in a
 * different shape) — see devtunnel-frontend's documented cookie contract.
 */
export async function createSession(
  supabase: SupabaseClient,
  userId: string,
  ttlSeconds: number,
  userAgent: string | null,
): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const { error } = await supabase.from("sessions").insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt,
    user_agent: userAgent,
  });

  if (error) throw new Error(`Failed to create session: ${error.message}`);
  return token;
}

/**
 * Looks up a session by its token, returning the associated user only if
 * the session exists and hasn't expired. Also opportunistically bumps
 * `last_used_at` — best-effort, failures here don't fail the request.
 */
export async function getUserForSessionToken(
  supabase: SupabaseClient,
  token: string,
): Promise<UserRow | null> {
  const tokenHash = await sha256Hex(token);

  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, user_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle<Pick<SessionRow, "id" | "user_id" | "expires_at">>();

  if (error) throw new Error(`Failed to look up session: ${error.message}`);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) return null;

  const { data: user, error: userError } = await supabase
    .from("users")
    .select()
    .eq("id", session.user_id)
    .maybeSingle<UserRow>();

  if (userError) throw new Error(`Failed to load session user: ${userError.message}`);
  if (!user) return null;

  // Best-effort touch; do not fail the request if this write fails.
  void supabase
    .from("sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", session.id)
    .then(undefined, () => undefined);

  return user;
}

export async function revokeSessionByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<void> {
  const tokenHash = await sha256Hex(token);
  const { error } = await supabase.from("sessions").delete().eq("token_hash", tokenHash);
  if (error) throw new Error(`Failed to revoke session: ${error.message}`);
}

export interface SessionUser {
  user: UserRow;
  isMaintainer: boolean;
}

/**
 * Same lookup as `getUserForSessionToken` above, but also resolves
 * `isMaintainer` (devtunnel.project_maintainers — db/devtunnelStats.ts
 * `getIsMaintainer`) as part of the same call.
 *
 * Both callers of this (`requireAuth` in src/middleware/auth.ts, and
 * `GET /auth/me` in src/routes/auth.ts) need exactly this pair — "who is
 * this" and "are they a maintainer of anything" — on literally every
 * authenticated request. Fetched separately, that was 3 *sequential*
 * round trips: session -> user -> maintainer count, each one waiting on
 * the last to even know what to ask for. In practice, the user row and
 * the maintainer check only ever depend on `session.user_id`, which is
 * already known the moment the session lookup returns — so those two
 * queries have no reason to wait on each other and are fired concurrently
 * via `Promise.all` instead. Cuts the per-request auth overhead from 3
 * sequential round trips to 2 (session lookup, then user+maintainer in
 * parallel) without changing what either caller receives.
 */
export async function getUserForSessionTokenWithMaintainerStatus(
  supabase: SupabaseClient,
  token: string,
): Promise<SessionUser | null> {
  const tokenHash = await sha256Hex(token);

  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, user_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle<Pick<SessionRow, "id" | "user_id" | "expires_at">>();

  if (error) throw new Error(`Failed to look up session: ${error.message}`);
  if (!session) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) return null;

  const [userResult, isMaintainer] = await Promise.all([
    supabase.from("users").select().eq("id", session.user_id).maybeSingle<UserRow>(),
    getIsMaintainer(supabase, session.user_id),
  ]);

  if (userResult.error) {
    throw new Error(`Failed to load session user: ${userResult.error.message}`);
  }
  if (!userResult.data) return null;

  // Best-effort touch; do not fail the request if this write fails.
  void supabase
    .from("sessions")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", session.id)
    .then(undefined, () => undefined);

  return { user: userResult.data, isMaintainer };
}