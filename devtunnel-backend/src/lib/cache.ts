import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../types";
import { getEnv } from "../config/env";
import { logger } from "./logger";
import { getSupabase } from "./supabase";
import { sha256Hex } from "./crypto";

/**
 * JSON cache + scan lock with ZERO Workers KV writes.
 *
 * WHY THIS CHANGED: Workers KV on the Free plan allows 1,000 writes/day for
 * the whole account. The catalog / issues / GitHub-detail caches, their cron
 * warmers and the scan lock were spending that budget, and once it was gone
 * every `put` failed (`cache_write_failed`, `cache_swr_write_failed`, ...).
 *
 * THE THREE LAYERS (read top to bottom, write bottom to top):
 *
 *   L1  in-isolate memory     free, instant, lost when the isolate recycles.
 *                             Trusted for L1_TRUST_MS, then re-verified so a
 *                             long-lived isolate can't serve a value the cron
 *                             warmer has since replaced.
 *   L2  Workers Cache API     free and NOT billed like KV writes. Per
 *                             data-centre, short max-age (L2_MAX_AGE_SECONDS).
 *                             (Silently does nothing on *.workers.dev — it
 *                             only works on a custom-domain route like
 *                             api.devtunnel.tech — which just means more L3
 *                             reads, never a failure.)
 *   L3  Supabase              `devtunnel.cache_entries` (sql/043). The durable
 *                             copy: survives cold starts and cache eviction,
 *                             and is shared by every data centre. A write is
 *                             SKIPPED when the content hash is unchanged (only
 *                             the timestamps are touched), so a warmer that
 *                             re-scans identical data costs no row rewrite.
 *
 * RELIABILITY RULES
 *  - Fail open: a cache read/write error is logged and treated as a miss /
 *    a no-op. It never fails the user's request.
 *  - Stale-while-error: if Supabase can't be read, the freshest copy from L1/L2
 *    is served even if it is past its soft TTL.
 *  - In-isolate coalescing: concurrent misses for one key share one refresh,
 *    and a failed background refresh backs off for REFRESH_BACKOFF_MS instead
 *    of being retried by every request.
 *  - Read-only KV fallback (KV_READ_FALLBACK): on a total miss the OLD
 *    `cache:swr:<key>` KV entry is READ (reads aren't limited like writes) so
 *    the first deploy doesn't start from a completely cold cache. Never
 *    written back to KV.
 *
 * FEATURE FLAG: `USE_SUPABASE_CACHE = "false"` disables L3 (cache then lives
 * in L1/L2 only). It never falls back to writing KV.
 */

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const SWR_PREFIX = "swr:";
const PLAIN_PREFIX = "plain:";
const LEGACY_KV_SWR_PREFIX = "cache:swr:";

/** How long a value loaded into this isolate is served without re-checking a lower layer. */
const L1_TRUST_MS = 60_000;
/** Max Cache API lifetime. Short so other data centres converge quickly on a newer L3 value. */
const L2_MAX_AGE_SECONDS = 120;
/** Isolate memory is 128 MB; parsed JSON is several times its text size, so cap hard. */
const L1_MAX_ENTRIES = 16;
const L1_MAX_VALUE_BYTES = 2 * 1024 * 1024;
const L1_MAX_TOTAL_BYTES = 24 * 1024 * 1024;

const READ_TIMEOUT_MS = 4_000;
const WRITE_TIMEOUT_MS = 8_000;
const REFRESH_BACKOFF_MS = 30_000;
/** A value recovered from the legacy KV entry is only served as stale for this long. */
const LEGACY_KV_GRACE_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Envelope<T> {
  /** ISO timestamp of the last successful refresh (drives soft-TTL freshness). */
  storedAt: string;
  /** Epoch ms after which this value is unusable even as a stale fallback. */
  hardExpiresAt: number;
  /** sha256 hex of JSON.stringify(value). */
  hash: string;
  value: T;
}

export type SwrReadResult<T> =
  | { status: "fresh"; value: T }
  | { status: "stale"; value: T }
  | { status: "miss" };

interface L1Entry {
  envelope: Envelope<unknown>;
  bytes: number;
  verifiedAt: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
let supabaseClient: SupabaseClient | null = null;

function db(env: Env): SupabaseClient {
  // getEnv() is validated once per isolate, so one client per isolate is safe.
  supabaseClient ??= getSupabase(getEnv(env));
  return supabaseClient;
}

function durableEnabled(env: Env): boolean {
  return env.USE_SUPABASE_CACHE !== "false";
}

function timeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms);
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function getCacheStorage(): Cache | null {
  try {
    const storage = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
    return storage?.default ?? null;
  } catch {
    return null;
  }
}

function l2Request(fullKey: string): Request {
  // Synthetic, internal-only URL: the Cache API just needs a well-formed GET key.
  return new Request(`https://cache.devtunnel.internal/v1/${encodeURIComponent(fullKey)}`);
}

// ---------------------------------------------------------------------------
// L1 — in-isolate memory
// ---------------------------------------------------------------------------
const l1 = new Map<string, L1Entry>();
let l1TotalBytes = 0;

function l1Forget(fullKey: string): void {
  const existing = l1.get(fullKey);
  if (existing) {
    l1TotalBytes -= existing.bytes;
    l1.delete(fullKey);
  }
}

function l1Remember(fullKey: string, envelope: Envelope<unknown>, bytes: number): void {
  l1Forget(fullKey);
  if (bytes > L1_MAX_VALUE_BYTES) return; // too big to hold in isolate memory
  while (l1.size >= L1_MAX_ENTRIES || l1TotalBytes + bytes > L1_MAX_TOTAL_BYTES) {
    const oldest = l1.keys().next();
    if (oldest.done) break;
    l1Forget(oldest.value);
  }
  l1.set(fullKey, { envelope, bytes, verifiedAt: Date.now() });
  l1TotalBytes += bytes;
}

// ---------------------------------------------------------------------------
// L2 — Workers Cache API
// ---------------------------------------------------------------------------
async function l2Read<T>(fullKey: string): Promise<{ envelope: Envelope<T>; bytes: number } | null> {
  const cache = getCacheStorage();
  if (!cache) return null;
  try {
    const hit = await cache.match(l2Request(fullKey));
    if (!hit) return null;
    const text = await hit.text();
    return { envelope: JSON.parse(text) as Envelope<T>, bytes: text.length };
  } catch (err) {
    logger.error("cache_l2_read_failed", { entry: fullKey, error: errMsg(err) });
    return null;
  }
}

async function l2Write(fullKey: string, envelopeText: string, hardExpiresAt: number): Promise<void> {
  const cache = getCacheStorage();
  if (!cache) return;
  const ttl = Math.min(L2_MAX_AGE_SECONDS, Math.floor((hardExpiresAt - Date.now()) / 1000));
  if (ttl <= 0) return;
  try {
    await cache.put(
      l2Request(fullKey),
      new Response(envelopeText, {
        headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl}` },
      }),
    );
  } catch (err) {
    logger.error("cache_l2_write_failed", { entry: fullKey, error: errMsg(err) });
  }
}

// ---------------------------------------------------------------------------
// L3 — Supabase (devtunnel.cache_entries)
// ---------------------------------------------------------------------------
type L3Result<T> = { kind: "hit"; envelope: Envelope<T> } | { kind: "miss" } | { kind: "error" };

async function l3Read<T>(env: Env, fullKey: string): Promise<L3Result<T>> {
  try {
    const { data, error } = await db(env)
      .from("cache_entries")
      .select("value, content_hash, stored_at, expires_at")
      .eq("key", fullKey)
      .gt("expires_at", new Date().toISOString())
      .abortSignal(timeout(READ_TIMEOUT_MS))
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return { kind: "miss" };

    return {
      kind: "hit",
      envelope: {
        storedAt: new Date(data.stored_at as string).toISOString(),
        hardExpiresAt: new Date(data.expires_at as string).getTime(),
        hash: data.content_hash as string,
        value: data.value as T,
      },
    };
  } catch (err) {
    logger.error("cache_l3_read_failed", { entry: fullKey, error: errMsg(err) });
    return { kind: "error" };
  }
}

/** Skips the heavy write when the hash is unchanged — only the timestamps move. */
async function l3Write(
  env: Env,
  fullKey: string,
  value: unknown,
  hash: string,
  storedAt: string,
  expiresAt: string,
): Promise<"touched" | "written"> {
  const client = db(env);

  const touched = await client
    .from("cache_entries")
    .update({ stored_at: storedAt, expires_at: expiresAt, updated_at: storedAt })
    .eq("key", fullKey)
    .eq("content_hash", hash)
    .select("key")
    .abortSignal(timeout(WRITE_TIMEOUT_MS));
  if (touched.error) throw new Error(touched.error.message);
  if (touched.data && touched.data.length > 0) return "touched";

  const written = await client
    .from("cache_entries")
    .upsert(
      { key: fullKey, value, content_hash: hash, stored_at: storedAt, expires_at: expiresAt, updated_at: storedAt },
      { onConflict: "key" },
    )
    .abortSignal(timeout(WRITE_TIMEOUT_MS));
  if (written.error) throw new Error(written.error.message);
  return "written";
}

/** Housekeeping, called by the daily 03:00 UTC cron (see src/index.ts). */
export async function purgeExpiredCacheRows(env: Env): Promise<void> {
  try {
    const { data, error } = await db(env).rpc("purge_expired_kv_replacements").abortSignal(timeout(WRITE_TIMEOUT_MS));
    if (error) throw new Error(error.message);
    logger.info("cache_purge_completed", { removed: data });
  } catch (err) {
    logger.error("cache_purge_failed", { error: errMsg(err) });
  }
}

// ---------------------------------------------------------------------------
// Layered read / write
// ---------------------------------------------------------------------------
function isExpired(envelope: Envelope<unknown>): boolean {
  return Date.now() >= envelope.hardExpiresAt;
}

function classify<T>(envelope: Envelope<T>, softTtlSeconds: number): SwrReadResult<T> {
  const ageSeconds = (Date.now() - new Date(envelope.storedAt).getTime()) / 1000;
  return ageSeconds < softTtlSeconds
    ? { status: "fresh", value: envelope.value }
    : { status: "stale", value: envelope.value };
}

function newer<T>(a: Envelope<T> | null, b: Envelope<T> | null): Envelope<T> | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a.storedAt).getTime() >= new Date(b.storedAt).getTime() ? a : b;
}

/** Read-only recovery of the pre-migration KV entry (see header). */
async function legacyKvRead<T>(env: Env, key: string): Promise<Envelope<T> | null> {
  if (env.KV_READ_FALLBACK === "false" || !env.RATE_LIMIT_KV) return null;
  try {
    const raw = await env.RATE_LIMIT_KV.get(LEGACY_KV_SWR_PREFIX + key);
    if (!raw) return null;
    const legacy = JSON.parse(raw) as { storedAt: string; value: T };
    if (!legacy?.storedAt) return null;
    return {
      storedAt: legacy.storedAt,
      hardExpiresAt: Date.now() + LEGACY_KV_GRACE_MS,
      hash: "legacy-kv",
      value: legacy.value,
    };
  } catch (err) {
    logger.error("cache_legacy_kv_read_failed", { entry: key, error: errMsg(err) });
    return null;
  }
}

async function readLayered<T>(
  env: Env,
  fullKey: string,
  softTtlSeconds: number,
  legacyKey: string | null,
): Promise<SwrReadResult<T>> {
  // L1 -------------------------------------------------------------------
  const mem = l1.get(fullKey);
  const memEnvelope = mem && !isExpired(mem.envelope) ? (mem.envelope as Envelope<T>) : null;
  if (mem && memEnvelope && Date.now() - mem.verifiedAt < L1_TRUST_MS) {
    return classify(memEnvelope, softTtlSeconds);
  }

  // L2 -------------------------------------------------------------------
  const edge = await l2Read<T>(fullKey);
  const edgeEnvelope = edge && !isExpired(edge.envelope) ? edge.envelope : null;
  if (edge && edgeEnvelope) {
    const result = classify(edgeEnvelope, softTtlSeconds);
    if (result.status === "fresh") {
      l1Remember(fullKey, edgeEnvelope, edge.bytes);
      return result;
    }
  }

  // Best copy we hold locally, used if the durable layer has nothing newer.
  const candidate = newer(memEnvelope, edgeEnvelope);

  // L3 -------------------------------------------------------------------
  if (durableEnabled(env)) {
    const durable = await l3Read<T>(env, fullKey);

    if (durable.kind === "hit") {
      const best = newer(durable.envelope, candidate)!;
      if (best === durable.envelope) {
        // Fill the upper layers so the next request in this isolate/colo is free.
        const text = JSON.stringify(best);
        l1Remember(fullKey, best, text.length);
        await l2Write(fullKey, text, best.hardExpiresAt);
      } else {
        l1Remember(fullKey, best, 0);
      }
      return classify(best, softTtlSeconds);
    }

    // "miss" or "error": serve whatever we still hold (stale-while-error).
    if (candidate) {
      l1Remember(fullKey, candidate, mem?.bytes ?? 0);
      return classify(candidate, softTtlSeconds);
    }
  } else if (candidate) {
    return classify(candidate, softTtlSeconds);
  }

  // Total miss: try the old KV entry once (read-only).
  if (legacyKey) {
    const legacy = await legacyKvRead<T>(env, legacyKey);
    if (legacy) {
      const text = JSON.stringify(legacy);
      l1Remember(fullKey, legacy, text.length);
      await l2Write(fullKey, text, legacy.hardExpiresAt);
      return classify(legacy, softTtlSeconds);
    }
  }

  return { status: "miss" };
}

async function writeLayered<T>(
  env: Env,
  fullKey: string,
  value: T,
  hardTtlSeconds: number,
  failureLog: string,
): Promise<void> {
  const valueText = JSON.stringify(value);
  const storedAt = new Date();
  const hardExpiresAt = storedAt.getTime() + hardTtlSeconds * 1000;
  const hash = await sha256Hex(valueText);

  const envelope: Envelope<T> = { storedAt: storedAt.toISOString(), hardExpiresAt, hash, value };

  // Durable copy first, so a successful return really means "survives a cold start".
  if (durableEnabled(env)) {
    try {
      await l3Write(env, fullKey, value, hash, envelope.storedAt, new Date(hardExpiresAt).toISOString());
    } catch (err) {
      // Best-effort: the request that produced this value already has it, and
      // L1/L2 below still get it.
      logger.error(failureLog, { entry: fullKey, error: errMsg(err) });
    }
  }

  const envelopeText = `{"storedAt":${JSON.stringify(envelope.storedAt)},"hardExpiresAt":${hardExpiresAt},"hash":"${hash}","value":${valueText}}`;
  l1Remember(fullKey, envelope, envelopeText.length);
  await l2Write(fullKey, envelopeText, hardExpiresAt);
}

// ---------------------------------------------------------------------------
// Plain TTL cache (public API unchanged)
// ---------------------------------------------------------------------------
export async function getCached<T>(env: Env, key: string): Promise<T | null> {
  try {
    const result = await readLayered<T>(env, PLAIN_PREFIX + key, Number.POSITIVE_INFINITY, null);
    return result.status === "miss" ? null : result.value;
  } catch (err) {
    logger.error("cache_read_failed", { entry: key, error: errMsg(err) });
    return null; // treat as a cache miss, never fail the request
  }
}

export async function setCached<T>(env: Env, key: string, value: T, ttlSeconds: number): Promise<void> {
  try {
    await writeLayered(env, PLAIN_PREFIX + key, value, ttlSeconds, "cache_write_failed");
  } catch (err) {
    // Best-effort — a failed cache write must not fail the request that
    // already has a good value to return.
    logger.error("cache_write_failed", { entry: key, error: errMsg(err) });
  }
}

// ---------------------------------------------------------------------------
// Stale-while-revalidate (SWR) cache (public API unchanged)
//
// Soft TTL = how fresh the data should ideally be; hard TTL = how long a value
// stays usable as a stale fallback. Past the soft TTL the cached value is
// returned immediately and the real refresh runs in the background
// (`ctx.waitUntil`); only a true miss pays for a synchronous refresh. The
// scheduled warmers (lib/cacheWarmers.ts) exist to keep real users off that
// path.
// ---------------------------------------------------------------------------

/**
 * Low-level SWR read: classifies an entry as fresh, stale, or missing
 * relative to `softTtlSeconds`, without triggering any refresh itself.
 */
export async function getCachedSWR<T>(
  env: Env,
  key: string,
  softTtlSeconds: number,
): Promise<SwrReadResult<T>> {
  try {
    return await readLayered<T>(env, SWR_PREFIX + key, softTtlSeconds, key);
  } catch (err) {
    logger.error("cache_swr_read_failed", { entry: key, error: errMsg(err) });
    return { status: "miss" }; // never fail the request over a bad cache read
  }
}

/**
 * Writes an SWR-managed entry. `hardTtlSeconds` is how long the value
 * survives as a usable *stale* fallback if nothing refreshes it — keep it
 * comfortably longer than any reader's soft TTL.
 */
export async function setCachedSWR<T>(
  env: Env,
  key: string,
  value: T,
  hardTtlSeconds: number,
): Promise<void> {
  try {
    await writeLayered(env, SWR_PREFIX + key, value, hardTtlSeconds, "cache_swr_write_failed");
  } catch (err) {
    logger.error("cache_swr_write_failed", { entry: key, error: errMsg(err) });
  }
}

/**
 * Anything that can outlive the current request the way Cloudflare's
 * `ExecutionContext` does (Hono's `c.executionCtx` and the `scheduled`
 * handler's ctx both satisfy this).
 */
interface WaitUntilCtx {
  waitUntil(promise: Promise<unknown>): void;
}

const refreshInFlight = new Set<string>();
const missInFlight = new Map<string, Promise<unknown>>();
const refreshBackoffUntil = new Map<string, number>();

/**
 * The full read-through stale-while-revalidate pattern.
 *
 * `refresh` returns `null` to mean "don't cache this" (never cache a scan that
 * produced nothing useful). On a `"stale"` read the refresh is fire-and-forget:
 * failures are logged and never propagate, since the caller already has a good
 * (if slightly old) value to return.
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
    const backedOff = (refreshBackoffUntil.get(key) ?? 0) > Date.now();
    if (!backedOff && !refreshInFlight.has(key)) {
      refreshInFlight.add(key);
      ctx.waitUntil(
        refresh()
          .then((fresh) => {
            if (fresh !== null) return setCachedSWR(env, key, fresh, opts.hardTtlSeconds);
          })
          .catch((err) => {
            refreshBackoffUntil.set(key, Date.now() + REFRESH_BACKOFF_MS);
            logger.error("cache_swr_background_refresh_failed", { entry: key, error: errMsg(err) });
          })
          .finally(() => refreshInFlight.delete(key)),
      );
    }
    return cached.value;
  }

  // True miss: nothing to serve stale, so one request pays for a synchronous
  // refresh. Concurrent misses for the same key in this isolate share it.
  const shared = missInFlight.get(key) as Promise<T | null> | undefined;
  if (shared) return shared;

  const run = (async () => {
    const fresh = await refresh();
    if (fresh !== null) {
      await setCachedSWR(env, key, fresh, opts.hardTtlSeconds);
    }
    return fresh;
  })().finally(() => missInFlight.delete(key));

  missInFlight.set(key, run);
  return run;
}

/**
 * Unconditionally refreshes an SWR-managed key and writes the result,
 * ignoring whatever's currently cached. This is what the scheduled cache
 * warmers call. Errors are caught and logged rather than thrown: a warmer is a
 * best-effort background job — if it fails, the next run tries again and
 * readers keep serving the last good entry.
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
      logger.warn("cache_warm_produced_nothing", { entry: key });
    }
  } catch (err) {
    logger.error("cache_warm_failed", { entry: key, error: errMsg(err) });
  }
}

// ---------------------------------------------------------------------------
// Scan lock (lease)
//
// The GitHub-wide catalog scans (`lib/githubCatalog.ts`) all draw on one GitHub
// Search budget (30 requests/minute for the one `GITHUB_DISCOVERY_TOKEN`). Two
// scans at once push each other into a rate-limit failure, so one scan runs at
// a time and everyone else backs off.
//
// This used to be a KV get-then-put (two KV ops, eventually consistent, so two
// callers could both "win"). It is now ONE atomic Supabase call
// (`try_acquire_scan_lock`, sql/043): an unexpired lease held by someone else
// matches zero rows, so exactly one caller wins. The lease expires on its own,
// so a Worker killed mid-scan can't hold the lock forever. A per-isolate map
// short-circuits the common "already scanning in this isolate" case without a
// network call.
//
// FEATURE FLAG: `USE_SUPABASE_LOCKS = "false"` keeps the lock in isolate
// memory only (still no KV writes).
// ---------------------------------------------------------------------------
const MIN_LOCK_TTL_SECONDS = 30;
const heldLocks = new Map<string, { owner: string; until: number }>();

/** Returns true if the lock was acquired (or the lock service is unavailable — fails open). */
export async function tryAcquireLock(env: Env, name: string, ttlSeconds: number): Promise<boolean> {
  const ttl = Math.max(Math.ceil(ttlSeconds), MIN_LOCK_TTL_SECONDS);

  const held = heldLocks.get(name);
  if (held && held.until > Date.now()) return false; // already scanning in THIS isolate

  const localUntil = Date.now() + ttl * 1000;

  if (env.USE_SUPABASE_LOCKS === "false") {
    heldLocks.set(name, { owner: "local", until: localUntil });
    return true;
  }

  const owner = crypto.randomUUID();
  try {
    const { data, error } = await db(env)
      .rpc("try_acquire_scan_lock", { p_name: name, p_owner: owner, p_ttl_seconds: ttl })
      .abortSignal(timeout(READ_TIMEOUT_MS));
    if (error) throw new Error(error.message);

    if (data === true) {
      heldLocks.set(name, { owner, until: localUntil });
      return true;
    }
    return false; // another isolate holds an unexpired lease
  } catch (err) {
    logger.error("cache_lock_acquire_failed", { name, error: errMsg(err) });
    heldLocks.set(name, { owner: "local", until: localUntil });
    return true; // fail open, same posture as the rate limiter
  }
}

export async function releaseLock(env: Env, name: string): Promise<void> {
  const held = heldLocks.get(name);
  heldLocks.delete(name);
  if (!held || held.owner === "local") return;

  try {
    const { error } = await db(env)
      .rpc("release_scan_lock", { p_name: name, p_owner: held.owner })
      .abortSignal(timeout(READ_TIMEOUT_MS));
    if (error) throw new Error(error.message);
  } catch (err) {
    // Not fatal: the lease expires by itself.
    logger.error("cache_lock_release_failed", { name, error: errMsg(err) });
  }
}