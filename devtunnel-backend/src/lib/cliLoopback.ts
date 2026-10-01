import type { Env } from "../types";
import { getEnv } from "../config/env";
import { logger } from "./logger";
import { randomToken, sha256Hex } from "./crypto";
import { getSupabase } from "./supabase";

/**
 * The `dev login` loopback flow (src/routes/authCli.ts) needs to hand a
 * short-lived, single-use code from `GET /auth/cli/callback` (running in
 * the user's browser, having just finished the GitHub round trip) to
 * `POST /auth/cli/token` (called moments later by the CLI's own local
 * HTTP server, a completely different process/origin). A cookie can't
 * cross that boundary — the CLI's loopback server isn't the browser — so
 * this is a tiny server-side handoff.
 *
 * STORAGE (changed): the handoff now lives in Supabase
 * (`devtunnel.cli_auth_codes`, sql/043), not Workers KV. Two reasons:
 *
 *  1. KV writes are capped at 1,000/day on the Free plan, account-wide. Once
 *     that budget is spent every `put` fails and nobody can sign in from the
 *     CLI at all.
 *  2. KV is eventually consistent, and the old get-then-delete could let two
 *     concurrent redemptions of the same code both succeed. Supabase's
 *     `consume_cli_auth_code()` is ONE atomic UPDATE ... WHERE used_at IS
 *     NULL, so a code can be redeemed exactly once, by construction.
 *
 * Only sha256(code) is stored, so a database read alone never yields a
 * redeemable code. The code itself is the bearer credential for this one
 * exchange; the TTL keeps it short (5 minutes: long enough to cover the
 * GitHub authorize screen plus the redirect back, never longer) and the
 * PKCE `challenge` stored beside it means a code intercepted on the
 * loopback redirect is useless without the CLI's own `verifier`.
 *
 * ROLLBACK: set `USE_SUPABASE_CLI_CODES = "false"` in wrangler.toml to fall
 * back to the previous KV implementation (kept below). It only costs one KV
 * write per login, but it is subject to the daily KV write limit again.
 */
const PENDING_TTL_SECONDS = 300;
const LEGACY_PENDING_PREFIX = "cli_pending:";

export interface PendingCliLogin {
  userId: string;
  /** sha256(verifier) hex, set by GET /auth/cli/callback, checked by POST /auth/cli/token. */
  challenge: string;
}

function useSupabase(env: Env): boolean {
  return env.USE_SUPABASE_CLI_CODES !== "false";
}

/** Creates a new one-time code and stores what it will resolve to. Returns the code. */
export async function createPendingCliLogin(env: Env, pending: PendingCliLogin): Promise<string> {
  const code = randomToken(32);

  if (!useSupabase(env)) {
    await env.RATE_LIMIT_KV.put(LEGACY_PENDING_PREFIX + code, JSON.stringify(pending), {
      expirationTtl: PENDING_TTL_SECONDS,
    });
    return code;
  }

  const supabase = getSupabase(getEnv(env));
  const { error } = await supabase.from("cli_auth_codes").insert({
    code_hash: await sha256Hex(code),
    user_id: pending.userId,
    challenge: pending.challenge,
    expires_at: new Date(Date.now() + PENDING_TTL_SECONDS * 1000).toISOString(),
  });

  if (error) {
    // Unlike a cache write this one MUST succeed — without the row the login
    // can never complete. The caller (GET /auth/cli/callback) already wraps
    // this in try/catch and renders the "server_error" page.
    throw new Error(`Failed to store CLI login code: ${error.message}`);
  }

  return code;
}

/**
 * Atomically marks the code as used and returns what it resolves to —
 * single-use by construction, regardless of whether the caller's PKCE
 * `verifier` later checks out. Returns `null` if the code is unknown,
 * already redeemed, or expired.
 */
export async function consumePendingCliLogin(env: Env, code: string): Promise<PendingCliLogin | null> {
  if (!useSupabase(env)) {
    const key = LEGACY_PENDING_PREFIX + code;
    try {
      const raw = await env.RATE_LIMIT_KV.get(key);
      if (!raw) return null;
      await env.RATE_LIMIT_KV.delete(key);
      return JSON.parse(raw) as PendingCliLogin;
    } catch (err) {
      logger.error("cli_pending_login_read_failed", { error: String(err) });
      return null;
    }
  }

  try {
    const supabase = getSupabase(getEnv(env));
    const { data, error } = await supabase.rpc("consume_cli_auth_code", {
      p_code_hash: await sha256Hex(code),
    });

    if (error) {
      logger.error("cli_pending_login_consume_failed", { error: error.message });
      return null;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row.out_user_id !== "string" || typeof row.out_challenge !== "string") {
      return null; // unknown, already used, or expired
    }

    return { userId: row.out_user_id, challenge: row.out_challenge };
  } catch (err) {
    logger.error("cli_pending_login_consume_failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}