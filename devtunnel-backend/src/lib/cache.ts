import type { Env } from "../types";
import { logger } from "./logger";

/**
 * Minimal JSON cache built on the KV namespace already declared for rate
 * limiting (`RATE_LIMIT_KV`). A dedicated `CACHE_KV` namespace would be
 * the cleaner long-term split, but this backend only has one cache
 * consumer so far (the GitHub contribution-calendar endpoints in
 * src/routes/contributions.ts) — introducing a second KV binding for a
 * single use site is unnecessary architecture for the current complexity
 * (Backend_Development_Rules.txt rule 71). Keys are prefixed so cache
 * entries can never collide with rate-limit counter keys (`rl:...` in
 * src/lib/rateLimit.ts).
 *
 * This is a plain cache, not a source of truth — every value here is
 * re-derivable from GitHub at any time, so a KV outage degrades to
 * "slower / more GitHub calls", never to incorrect data (fails open on
 * both read and write, rule 21: errors are handled, not silently
 * swallowed — they're logged).
 */
const CACHE_PREFIX = "cache:";

export async function getCached<T>(env: Env, key: string): Promise<T | null> {
  try {
    const raw = await env.RATE_LIMIT_KV.get(CACHE_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.error("cache_read_failed", { key, error: String(err) });
    return null; // treat as a cache miss, never fail the request
  }
}

export async function setCached<T>(
  env: Env,
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  try {
    await env.RATE_LIMIT_KV.put(CACHE_PREFIX + key, JSON.stringify(value), {
      expirationTtl: ttlSeconds,
    });
  } catch (err) {
    // Best-effort — a failed cache write must not fail the request that
    // already has a good value to return.
    logger.error("cache_write_failed", { key, error: String(err) });
  }
}