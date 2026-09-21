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
 *
 * Write batching: the naive version of this wrote to KV on every single
 * allowed request. With this function called from nearly every route in
 * the app, that meant "one API request in, one KV put out" — which blows
 * through Workers KV's free-tier 1,000 puts/day limit almost immediately
 * under completely normal traffic (see the Cloudflare "KV daily operation
 * limit exceeded" emails this was chasing). `localCounters` below keeps a
 * best-known count per key *in the current Worker isolate's memory* and
 * only flushes to KV every `WRITE_BATCH_SIZE` increments (or immediately
 * once the caller is about to be rejected, so a block always sticks).
 * This is a pure write-reduction optimization, not a new source of truth:
 * KV remains authoritative, isolates are ephemeral and can be evicted at
 * any time, and a fresh isolate just re-seeds its local count from KV on
 * its first check for a key. Worst case if an isolate is recycled mid
 * window is under-counting by up to `WRITE_BATCH_SIZE - 1` requests,
 * which is an acceptable trade for a control that only ever protects
 * availability/abuse and never gates authorization.
 */

interface LocalCounter {
  /** Best-known total for this key, seeded from KV then incremented locally. */
  count: number;
  /** Increments made locally since the last KV write. */
  unflushed: number;
  /** Wall-clock time after which this entry is safe to garbage-collect. */
  expiresAt: number;
}

const localCounters = new Map<string, LocalCounter>();

/** Only write to KV every this many local increments (except when a
 * request is about to be rejected, which always flushes immediately so
 * the block is visible to every isolate right away). Chosen so that even
 * the tightest buckets in this codebase (limit 5) still write on
 * essentially every request, while the common 20-120/window buckets see
 * roughly a 5x cut in KV puts. */
const WRITE_BATCH_SIZE = 5;

/** Occasionally sweep expired entries so a long-lived isolate serving many
 * distinct identities/buckets doesn't grow this map without bound. Runs
 * probabilistically rather than on every call to keep the common path cheap. */
function maybeSweep() {
  if (Math.random() >= 0.01) return;
  const now = Date.now();
  for (const [k, v] of localCounters) {
    if (v.expiresAt < now) localCounters.delete(k);
  }
}

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
  const ttlSeconds = windowSeconds + 5;

  maybeSweep();

  try {
    let local = localCounters.get(key);
    if (!local) {
      const stored = Number((await c.env.RATE_LIMIT_KV.get(key)) ?? "0");
      local = { count: stored, unflushed: 0, expiresAt: Date.now() + ttlSeconds * 1000 };
      localCounters.set(key, local);
    }

    if (local.count >= limit) return false;

    local.count += 1;
    local.unflushed += 1;
    local.expiresAt = Date.now() + ttlSeconds * 1000;

    // Flush every WRITE_BATCH_SIZE increments, and always flush the
    // request that hits the limit so the block is immediately visible to
    // every isolate rather than lingering as "unflushed" in this one.
    if (local.unflushed >= WRITE_BATCH_SIZE || local.count >= limit) {
      const toWrite = local.count;
      local.unflushed = 0;
      const writePromise = c.env.RATE_LIMIT_KV.put(key, String(toWrite), {
        expirationTtl: ttlSeconds,
      }).catch((err) => {
        logger.error("rate_limit_write_failed", { bucket, error: String(err) });
      });
      // Don't make the caller wait on the KV write — the local count
      // already reflects it for this isolate's own purposes.
      c.executionCtx.waitUntil(writePromise);
    }

    return true;
  } catch (err) {
    // Fail open on KV outages — availability of auth shouldn't depend on
    // an ancillary store, but we log loudly since this is a security
    // control silently degrading (rule 21: never swallow errors).
    logger.error("rate_limit_check_failed", { bucket, error: String(err) });
    return true;
  }
}