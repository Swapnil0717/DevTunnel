import type { Context } from "hono";
import type { Env } from "../types";
import { logger } from "./logger";

/**
 * Simple fixed-window counter in KV: key = `rl:{bucket}:{identity}:{window}`.
 * Not perfectly precise at window boundaries (a fixed-window limiter never
 * is), but it is cheap, requires no extra infrastructure beyond the KV
 * namespace already declared in wrangler.toml, and satisfies
 * Backend_Development_Rules.txt rule 43 (rate limiting is mandatory for
 * sensitive public endpoints) without pretending to replace authorization
 * (rule 44 — this only protects availability/abuse, never decides access).
 */
export interface RateLimitOptions {
  /** Logical bucket name, e.g. "auth-github", "auth-me". */
  bucket: string;
  /** Max requests allowed per window. */
  limit: number;
  /** Window size in seconds. */
  windowSeconds: number;
  /**
   * Overrides who the limit is counted against. Defaults to the
   * connecting IP, which is right for public/unauthenticated endpoints —
   * but wrong for a route that's called *server-side by the Next.js
   * frontend Worker* on behalf of a signed-in user: every visitor's
   * request then arrives from the frontend's own address, so they'd all
   * share one bucket and one busy visitor could lock out everyone else.
   * Authenticated routes should pass something like `user:${user.id}`.
   */
  identity?: string;
}

function clientIdentity(c: Context): string {
  // Cloudflare sets this on every request; it's the best available client
  // identity without requiring the user to already be authenticated.
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
}

/** Returns true when the request is within limits; false when it should be rejected. */
export async function checkRateLimit(
  c: Context<{ Bindings: Env }>,
  options: RateLimitOptions,
): Promise<boolean> {
  const { bucket, limit, windowSeconds } = options;
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const identity = options.identity ?? clientIdentity(c);
  const key = `rl:${bucket}:${identity}:${window}`;

  try {
    const current = Number((await c.env.RATE_LIMIT_KV.get(key)) ?? "0");
    if (current >= limit) return false;

    await c.env.RATE_LIMIT_KV.put(key, String(current + 1), {
      expirationTtl: windowSeconds + 5,
    });
    return true;
  } catch (err) {
    // Fail open on KV outages — availability of auth shouldn't depend on
    // an ancillary store, but we log loudly since this is a security
    // control silently degrading (rule 21: never swallow errors).
    logger.error("rate_limit_check_failed", { bucket, error: String(err) });
    return true;
  }
}