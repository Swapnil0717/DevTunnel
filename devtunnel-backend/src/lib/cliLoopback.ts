import type { Env } from "../types";
import { logger } from "./logger";
import { randomToken } from "./crypto";

/**
 * The `dev login` loopback flow (src/routes/authCli.ts) needs to hand a
 * short-lived, single-use code from `GET /auth/cli/callback` (running in
 * the user's browser, having just finished the GitHub round trip) to
 * `POST /auth/cli/token` (called moments later by the CLI's own local
 * HTTP server, a completely different process/origin). A cookie can't
 * cross that boundary — the CLI's loopback server isn't the browser — so
 * this is a tiny KV-backed handoff instead, built on the same
 * `RATE_LIMIT_KV` namespace src/lib/cache.ts already reuses as a general
 * cache rather than provisioning a third KV binding for one call site
 * (Backend_Development_Rules.txt rule 71).
 *
 * Same shape as `devtunnel.sessions`/`devtunnel.cli_tokens` in spirit —
 * the *code* itself is the bearer credential for this one exchange, so
 * TTL keeps it short (5 minutes: long enough to cover the GitHub
 * authorize screen plus the redirect back, never longer) and it is
 * deleted the moment it's read, so it can only ever be redeemed once.
 */
const PENDING_PREFIX = "cli_pending:";
const PENDING_TTL_SECONDS = 300;

export interface PendingCliLogin {
  userId: string;
  /** sha256(verifier) hex, set by GET /auth/cli/callback, checked by POST /auth/cli/token. */
  challenge: string;
}

/** Creates a new one-time code and stores what it will resolve to. Returns the code. */
export async function createPendingCliLogin(env: Env, pending: PendingCliLogin): Promise<string> {
  const code = randomToken(32);
  await env.RATE_LIMIT_KV.put(PENDING_PREFIX + code, JSON.stringify(pending), {
    expirationTtl: PENDING_TTL_SECONDS,
  });
  return code;
}

/**
 * Reads and immediately deletes the pending login for `code` — single-use
 * by construction, regardless of whether the caller's PKCE `verifier`
 * later checks out. Returns `null` if the code is unknown, already
 * redeemed, or expired.
 */
export async function consumePendingCliLogin(env: Env, code: string): Promise<PendingCliLogin | null> {
  const key = PENDING_PREFIX + code;
  try {
    const raw = await env.RATE_LIMIT_KV.get(key);
    if (!raw) return null;
    // Delete before returning: a code must not be redeemable twice even
    // if the caller's verifier check below turns out to fail.
    await env.RATE_LIMIT_KV.delete(key);
    return JSON.parse(raw) as PendingCliLogin;
  } catch (err) {
    logger.error("cli_pending_login_read_failed", { error: String(err) });
    return null;
  }
}