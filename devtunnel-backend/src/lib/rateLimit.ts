import type { Context } from "hono";
import type { Env } from "../types";
import { logger } from "./logger";

/**
 * Abuse/availability rate limiting with ZERO Workers KV writes.
 *
 * WHY THIS CHANGED: the previous limiter kept a fixed-window counter in KV
 * (`rl:{bucket}:{identity}:{window}`) and, even after batching, still spent
 * hundreds of the Free plan's 1,000 KV writes/day on normal traffic.
 *
 * HOW IT WORKS NOW: Cloudflare's built-in Rate Limiting binding
 * (`env.RL_<n>.limit({ key })`, declared in wrangler.toml). It is a local call
 * — no KV, no Supabase round trip, no subrequest, no cost. The one catch is
 * that a binding's limit and period are fixed in wrangler.toml, not passed per
 * call. So wrangler.toml declares one binding per limit value used in this
 * codebase (all with a 60 s period, see `LIMIT_TIERS`), and every call site
 * keeps its existing `{ bucket, limit, windowSeconds }` signature: this file
 * picks the binding whose limit matches, and the per-call `key` is
 * `{bucket}:{identity}` so each bucket/identity pair gets its own counter.
 *
 * WINDOWS LONGER THAN 60 s: bindings only support 10 s or 60 s periods, and a
 * few admin-onboarding buckets and the catalog "refresh" button use 300 s
 * windows. Those are mapped to the tier at or above their per-minute rate
 * (e.g. 10 per 300 s -> 4 per 60 s). That is slightly looser per 5-minute
 * window than before; it is still abuse protection only, and every one of
 * those routes is also behind authentication.
 *
 * ACCURACY: counts are approximate and local to the Cloudflare data centre
 * serving the request. That is fine for what this protects (availability and
 * abuse — never authorization). `identity` handling is unchanged: it defaults
 * to the connecting IP, and authenticated routes pass `user:${id}`.
 *
 * FALLBACK: if a tier's binding isn't configured (misconfigured deploy, local
 * `wrangler dev` without bindings) or `USE_RATE_LIMIT_BINDING = "false"`, a
 * per-isolate in-memory fixed window is used. Still no KV writes. It is weaker
 * (each isolate counts alone) and logs once per bucket so it can't silently
 * stay that way.
 *
 * FAIL OPEN: any error from the limiter allows the request and logs
 * `rate_limit_check_failed` — availability of the app shouldn't depend on an
 * ancillary control.
 */

/** Every distinct per-minute limit used by a `checkRateLimit` call site. Each has a binding `RL_<n>` in wrangler.toml. */
export const LIMIT_TIERS = [4, 5, 6, 8, 10, 15, 20, 30, 40, 60, 120] as const;

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

/** Smallest tier whose per-minute limit is >= the requested rate. */
function pickTier(limit: number, windowSeconds: number): number {
  const perMinute = (limit * 60) / windowSeconds;
  return LIMIT_TIERS.find((tier) => tier >= perMinute) ?? LIMIT_TIERS[LIMIT_TIERS.length - 1]!;
}

type LimiterBinding = { limit(options: { key: string }): Promise<{ success: boolean }> };

function bindingFor(env: Env, tier: number): LimiterBinding | null {
  if (env.USE_RATE_LIMIT_BINDING === "false") return null;
  const candidate = (env as unknown as Record<string, unknown>)[`RL_${tier}`];
  return candidate && typeof (candidate as LimiterBinding).limit === "function"
    ? (candidate as LimiterBinding)
    : null;
}

// ---------------------------------------------------------------------------
// In-memory fallback (per isolate, no KV)
// ---------------------------------------------------------------------------
interface LocalWindow {
  count: number;
  resetAt: number;
}

const localWindows = new Map<string, LocalWindow>();
const warnedBuckets = new Set<string>();

function maybeSweep(now: number): void {
  if (Math.random() >= 0.01) return;
  for (const [key, window] of localWindows) {
    if (window.resetAt < now) localWindows.delete(key);
  }
}

function checkLocal(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  maybeSweep(now);

  const existing = localWindows.get(key);
  if (!existing || existing.resetAt <= now) {
    localWindows.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

/** Returns true when the request is within limits; false when it should be rejected. */
export async function checkRateLimit(
  // `Context<any>`: routes use differing Variables shapes (with/without the
  // authenticated user), and a narrower type here made every call from a route
  // with Variables fail to typecheck. Only `c.env` and `c.req.header` are used.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  c: Context<any>,
  options: RateLimitOptions,
): Promise<boolean> {
  const { bucket, limit, windowSeconds } = options;
  const env = c.env as Env;
  const identity = (options.identity ?? clientIdentity(c)).slice(0, 200);
  const key = `${bucket}:${identity}`;

  try {
    const tier = pickTier(limit, windowSeconds);
    const binding = bindingFor(env, tier);

    if (binding) {
      const { success } = await binding.limit({ key });
      return success;
    }

    if (env.USE_RATE_LIMIT_BINDING !== "false" && !warnedBuckets.has(bucket)) {
      warnedBuckets.add(bucket);
      logger.warn("rate_limit_binding_missing_using_memory", { bucket, tier });
    }
    return checkLocal(key, limit, windowSeconds);
  } catch (err) {
    // Fail open — but log loudly, since this is a security control silently
    // degrading (rule 21: never swallow errors).
    logger.error("rate_limit_check_failed", { bucket, error: String(err) });
    return true;
  }
}