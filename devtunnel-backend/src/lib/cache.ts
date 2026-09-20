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

// ---------------------------------------------------------------------------
// Stale-while-revalidate (SWR) cache
//
// The plain `getCached`/`setCached` pair above has one hard failure mode:
// whoever's request lands right after a KV entry's TTL expires pays, inline,
// for whatever expensive thing produced that value (a live cross-project
// GitHub issue scan, a GitHub Search API catalog walk — see
// `lib/githubCatalog.ts` and `routes/issues.ts`). That's the actual cause of
// the occasional multi-second/multi-minute page loads on the GitHub
// Projects, Open Source Tools, and All Issues pages: not that the work is
// slow on average, but that it's occasionally paid for synchronously by
// whichever real user's request happens to be the one that finds a cold
// cache.
//
// `withCacheSWR` below removes that failure mode for any cache consumer
// willing to distinguish a "soft" TTL (how fresh the data should ideally be)
// from a "hard" TTL (how long a value stays in KV as a usable fallback even
// once it's gone stale):
//
//   - Within the soft TTL: return the cached value. Nothing else happens.
//   - Past the soft TTL but still in KV (within the hard TTL): return the
//     cached value immediately — the user's request is never blocked on a
//     re-scan — and kick the real refresh off in the background via
//     `ExecutionContext.waitUntil`, so the *next* request gets a fresh
//     value without anyone ever waiting on it.
//   - Not in KV at all (a true miss — first run, or the hard TTL expired
//     because nothing has refreshed this key in a long time): there is
//     nothing to serve stale, so this one request pays for a synchronous
//     refresh, same as `getCached`/`setCached` always did. A scheduled
//     warmer (see `lib/cacheWarmers.ts`) is what's meant to keep real user
//     requests from ever landing here in practice.
//
// Stored under a distinct `cache:swr:` prefix (never `cache:`) so an
// SWR-managed entry's `{ storedAt, value }` envelope can never be misread
// by a plain `getCached<T>` call expecting a bare `T`, or vice versa.
// ---------------------------------------------------------------------------

const SWR_CACHE_PREFIX = "cache:swr:";

interface CacheEnvelope<T> {
  /** ISO timestamp of when this value was last (successfully) refreshed. */
  storedAt: string;
  value: T;
}

export type SwrReadResult<T> =
  | { status: "fresh"; value: T }
  | { status: "stale"; value: T }
  | { status: "miss" };

/**
 * Low-level SWR read: classifies a KV entry as fresh, stale, or missing
 * relative to `softTtlSeconds`, without triggering any refresh itself.
 * Most callers want `withCacheSWR` below instead — this is exposed
 * separately for callers (like the scheduled warmers) that need to inspect
 * cache state without also deciding what to do about it.
 */
export async function getCachedSWR<T>(
  env: Env,
  key: string,
  softTtlSeconds: number,
): Promise<SwrReadResult<T>> {
  try {
    const raw = await env.RATE_LIMIT_KV.get(SWR_CACHE_PREFIX + key);
    if (!raw) return { status: "miss" };

    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    const ageSeconds = (Date.now() - new Date(envelope.storedAt).getTime()) / 1000;

    return ageSeconds < softTtlSeconds
      ? { status: "fresh", value: envelope.value }
      : { status: "stale", value: envelope.value };
  } catch (err) {
    logger.error("cache_swr_read_failed", { key, error: String(err) });
    return { status: "miss" }; // never fail the request over a bad cache read
  }
}

/**
 * Writes an SWR-managed cache entry. `hardTtlSeconds` is the KV
 * `expirationTtl` — how long this value survives as a usable *stale*
 * fallback if nothing refreshes it again in the meantime — and should
 * always be comfortably longer than the `softTtlSeconds` any reader of this
 * key uses, so a temporary gap in the scheduled warmer degrades to "a bit
 * stale" rather than "a real miss that blocks a user's request".
 */
export async function setCachedSWR<T>(
  env: Env,
  key: string,
  value: T,
  hardTtlSeconds: number,
): Promise<void> {
  try {
    const envelope: CacheEnvelope<T> = { storedAt: new Date().toISOString(), value };
    await env.RATE_LIMIT_KV.put(SWR_CACHE_PREFIX + key, JSON.stringify(envelope), {
      expirationTtl: hardTtlSeconds,
    });
  } catch (err) {
    logger.error("cache_swr_write_failed", { key, error: String(err) });
  }
}

/**
 * Anything that can outlive the current request the way Cloudflare's
 * `ExecutionContext` does. Typed as a minimal structural interface (rather
 * than importing `ExecutionContext` here) so this file doesn't need the
 * Workers runtime types just to describe the one method it actually calls —
 * both Hono's `c.executionCtx` and the raw `ExecutionContext` passed into
 * the `scheduled` handler satisfy this.
 */
interface WaitUntilCtx {
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * The full read-through stale-while-revalidate pattern described above.
 *
 * `refresh` should return `null` to mean "don't cache this" — the same
 * "only cache a non-empty/successful result" rule every cache consumer in
 * this backend already followed by hand before this helper existed (rule
 * 21: never cache a scan that produced nothing useful, whether that's an
 * empty catalog or a GitHub call that failed outright).
 *
 * On a `"stale"` read, the background refresh is fire-and-forget from this
 * function's point of view — failures are logged inside the `.catch` below
 * and never propagate to the caller, since the caller already has a good
 * (if slightly old) value to return right now.
 */
export async function withCacheSWR<T>(
  ctx: WaitUntilCtx,
  env: Env,
  key: string,
  opts: { softTtlSeconds: number; hardTtlSeconds: number },
  refresh: () => Promise<T | null>,
): Promise<T | null> {
  const cached = await getCachedSWR<T>(env, key, opts.softTtlSeconds);

  if (cached.status === "fresh") {
    return cached.value;
  }

  if (cached.status === "stale") {
    ctx.waitUntil(
      refresh()
        .then((fresh) => {
          if (fresh !== null) return setCachedSWR(env, key, fresh, opts.hardTtlSeconds);
        })
        .catch((err) => {
          logger.error("cache_swr_background_refresh_failed", {
            key,
            error: err instanceof Error ? err.message : String(err),
          });
        }),
    );
    return cached.value;
  }

  // True miss: nothing to serve stale, so this one request pays for a real
  // synchronous refresh — exactly the case the scheduled cache warmers
  // (lib/cacheWarmers.ts) exist to keep real user traffic away from.
  const fresh = await refresh();
  if (fresh !== null) {
    await setCachedSWR(env, key, fresh, opts.hardTtlSeconds);
  }
  return fresh;
}

/**
 * Unconditionally refreshes an SWR-managed key and writes the result,
 * ignoring whatever's currently cached. This is what the scheduled cache
 * warmers call — a cron trigger always wants a real, fresh scan, never a
 * cached value, regardless of the current soft/hard TTL state.
 *
 * Errors are caught and logged rather than thrown: a warmer run is a
 * best-effort background job (same posture `runDailyDiscovery`'s own
 * `scheduled` handler already takes in src/index.ts) — if it fails, the
 * next scheduled run tries again, and in the meantime `withCacheSWR`
 * readers just keep serving whatever's still in KV (fresh or stale) until
 * then.
 */
export async function warmCacheSWR<T>(
  env: Env,
  key: string,
  hardTtlSeconds: number,
  refresh: () => Promise<T | null>,
): Promise<void> {
  try {
    const fresh = await refresh();
    if (fresh !== null) {
      await setCachedSWR(env, key, fresh, hardTtlSeconds);
    } else {
      logger.warn("cache_warm_produced_nothing", { key });
    }
  } catch (err) {
    logger.error("cache_warm_failed", { key, error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------------------
// Best-effort scan lock
//
// The GitHub-wide catalog scans (`lib/githubCatalog.ts`) all draw on one
// GitHub Search budget (30 requests/minute for the one
// `GITHUB_DISCOVERY_TOKEN`). Two scans running at once — the scheduled
// warmer plus a request that found a cold cache, or several requests that
// all found the same cold cache — each burn that budget and push the other
// into a rate-limit failure. A short-lived KV marker lets one scan run at a
// time; everyone else backs off instead of piling on.
//
// KV is eventually consistent and this is a get-then-put, so two callers
// can occasionally both win the lock. That's acceptable: the lock only has
// to make a pile-up rare, not impossible, and the scan itself is
// rate-limit-aware and never fails destructively (see `scanCatalog`).
// The TTL is the safety net if a Worker is killed before it can release —
// KV's minimum `expirationTtl` is 60s, so it's clamped up to that.
// ---------------------------------------------------------------------------

const LOCK_PREFIX = "lock:";

/** Returns true if the lock was acquired (or KV is unavailable — fails open). */
export async function tryAcquireLock(env: Env, name: string, ttlSeconds: number): Promise<boolean> {
  const key = LOCK_PREFIX + name;
  try {
    if (await env.RATE_LIMIT_KV.get(key)) return false;
    await env.RATE_LIMIT_KV.put(key, new Date().toISOString(), {
      expirationTtl: Math.max(ttlSeconds, 60),
    });
    return true;
  } catch (err) {
    logger.error("cache_lock_acquire_failed", { name, error: String(err) });
    return true; // fail open, same posture as the rate limiter
  }
}

export async function releaseLock(env: Env, name: string): Promise<void> {
  try {
    await env.RATE_LIMIT_KV.delete(LOCK_PREFIX + name);
  } catch (err) {
    logger.error("cache_lock_release_failed", { name, error: String(err) });
  }
}