// devtunnel-backend/src/lib/ai/usage.ts
import type { ValidatedEnv } from "../../config/env";
import { getSupabase } from "../supabase";
import { logger } from "../logger";
import { PROVIDERS, type ProviderId } from "./providers";

/**
 * AI quota tracking with ZERO Workers KV writes.
 *
 * WHY this exists: the old groqQuota.ts wrote six KV counters per Groq call
 * (rpd, tpd, phase rpd, phase tpd, rpm, tpm) — ~600 KV writes per discovery
 * run against the Workers Free plan's 1,000 writes/DAY cap. That is what got
 * KV writes blocked. This module replaces those counters with three cheap
 * sources, none of which touch KV:
 *
 *  (a) Provider response headers (`x-ratelimit-remaining-*`, `retry-after`):
 *      the provider tells us when it is out and when it resets, so we
 *      believe it instead of guessing "UTC midnight".
 *  (b) An in-memory "exhausted until" map per isolate. A 429 sets it, so the
 *      rest of that run skips the dead provider without any storage at all.
 *  (c) Daily totals per provider (and per model / discovery phase) in the
 *      Supabase table `ai_usage_daily`, updated in BATCHES: increments are
 *      accumulated in memory and flushed in one RPC every FLUSH_EVERY calls,
 *      at least every FLUSH_MAX_AGE_MS, and at the end of a discovery run
 *      (routes/admin/ai.ts and index.ts call flushAiUsage).
 *
 * Deliberate trade-offs (documented, not hidden):
 *  - Daily totals are loaded once per isolate and cached (BASE_TTL_MS), so a
 *    100-call discovery run costs ~1 read + a handful of batched writes
 *    instead of ~600 KV writes. Two isolates running discovery at the same
 *    moment can both act on a slightly stale baseline; the provider's own
 *    429 + headers are the backstop.
 *  - If an isolate is killed before its last flush, up to FLUSH_EVERY-1
 *    calls of accounting are lost. Stats are approximate by design.
 *  - PART 7 (admin usage panel): exhaustion windows and the last error class
 *    per provider+model are ALSO queued here and written to Supabase
 *    `ai_provider_status` (sql/042) — only when something fails, so the
 *    admin panel can see what another isolate observed. Error counts per
 *    day go into `ai_usage_daily` under scope `err:<class>`. Both ride the
 *    same batched flush as the usage counters; still zero KV writes.
 *  - The per-minute guard is IN MEMORY. A discovery run is one isolate, so
 *    it sees all of its own calls. The admin quota panel's "this minute"
 *    numbers therefore only reflect calls made by the isolate answering
 *    that request (usually 0 outside a running discovery).
 */

export interface Totals {
  requests: number;
  tokens: number;
}

const FLUSH_EVERY = 20;
const FLUSH_MAX_AGE_MS = 60_000;
const BASE_TTL_MS = 5 * 60_000;
const LOAD_RETRY_MS = 60_000;

/** Very rough token estimate (chars / 3.5); errs conservative. Only used when the provider reports no usage. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// ---------------------------------------------------------------------------
// Day keys + reset times
// ---------------------------------------------------------------------------

function dayKey(tz: "UTC" | "America/Los_Angeles", now = new Date()): string {
  if (tz === "UTC") return now.toISOString().slice(0, 10);
  // en-CA formats as YYYY-MM-DD.
  return now.toLocaleDateString("en-CA", { timeZone: tz });
}

export function dayKeyFor(provider: ProviderId): string {
  return dayKey(PROVIDERS[provider].resetTz);
}

export function msUntilUtcMidnight(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}

function msUntilPacificMidnight(now = new Date()): number {
  // Walk forward until the Pacific calendar day changes (minute steps, then refine) — avoids DST arithmetic.
  const today = dayKey("America/Los_Angeles", now);
  let lo = now.getTime();
  let hi = lo + 25 * 60 * 60_000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (dayKey("America/Los_Angeles", new Date(mid)) === today) lo = mid;
    else hi = mid;
  }
  return hi - now.getTime();
}

export function msUntilDailyReset(provider: ProviderId): number {
  return PROVIDERS[provider].resetTz === "UTC" ? msUntilUtcMidnight() : msUntilPacificMidnight();
}

// ---------------------------------------------------------------------------
// (a) + (b): header parsing and the in-memory "exhausted until" map
// ---------------------------------------------------------------------------

const exhaustedUntil = new Map<string, number>();

/** Milliseconds until `key` (provider:model) is usable again; 0 when usable. */
export function exhaustedForMs(key: string): number {
  const until = exhaustedUntil.get(key);
  if (!until) return 0;
  const left = until - Date.now();
  if (left <= 0) {
    exhaustedUntil.delete(key);
    return 0;
  }
  return left;
}

export function markExhausted(key: string, ms: number, reason: string): void {
  const until = Date.now() + Math.max(ms, 1000);
  const existing = exhaustedUntil.get(key) ?? 0;
  if (until > existing) {
    exhaustedUntil.set(key, until);
    queueStatus(key, { exhaustedUntil: until, exhaustedReason: reason.slice(0, 80) });
  }
  logger.warn("ai_provider_exhausted", { key, waitMs: Math.round(ms), reason });
}

// ---------------------------------------------------------------------------
// Part 7: provider status events (exhaustion window + last error class)
// ---------------------------------------------------------------------------

/** Error classes the admin panel distinguishes. Set by client.ts, one per failed provider attempt. */
export type AiErrorClass = "quota" | "too_large" | "auth" | "server" | "timeout" | "network" | "bad_request";

interface StatusPatch {
  exhaustedUntil?: number;
  exhaustedReason?: string;
  errorClass?: AiErrorClass;
  errorAt?: number;
}

const statusPending = new Map<string, StatusPatch>();
/** Failures are rare, but a flapping provider must not cost a Supabase call per failure. */
const STATUS_FLUSH_MIN_MS = 5_000;
let lastStatusFlushAt = 0;

function queueStatus(key: string, patch: StatusPatch): void {
  statusPending.set(key, { ...statusPending.get(key), ...patch });
}

/** True when failures/exhaustions are waiting to be written. */
export function hasPendingProviderStatus(): boolean {
  return statusPending.size > 0;
}

/**
 * Records one failed provider attempt: queues the "last error" for the admin
 * panel and bumps today's per-class counter (`err:<class>` scope). Synchronous
 * and in-memory — the write happens in the next flush.
 */
export function recordAiError(provider: ProviderId, model: string, errorClass: AiErrorClass): void {
  queueStatus(`${provider}:${model}`, { errorClass, errorAt: Date.now() });
  const day = dayKeyFor(provider);
  const k = rowKey(day, provider, `err:${errorClass}`);
  const row = pending.get(k);
  if (row) row.requests += 1;
  else pending.set(k, { provider, day, scope: `err:${errorClass}`, requests: 1, tokens: 0 });
}

/** Test/admin helper: forget every in-memory exhaustion marker. */
export function resetExhaustedState(): void {
  exhaustedUntil.clear();
  statusPending.clear();
  lastStatusFlushAt = 0;
}

/**
 * Parses reset values as providers send them: plain seconds ("30", "0.5"),
 * Go-style durations ("2m59.56s", "7.66s", "250ms", "1h2m"), or an
 * HTTP-date (for Retry-After). Returns null when unparseable.
 */
export function parseDurationMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const v = value.trim();
  if (/^\d+(\.\d+)?$/.test(v)) return Math.ceil(Number(v) * 1000);
  const goStyle = /^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m(?!s))?(?:(\d+(?:\.\d+)?)s)?(?:(\d+(?:\.\d+)?)ms)?$/.exec(v);
  if (goStyle && (goStyle[1] || goStyle[2] || goStyle[3] || goStyle[4])) {
    const [, h, m, s, ms] = goStyle;
    return Math.ceil(Number(h ?? 0) * 3_600_000 + Number(m ?? 0) * 60_000 + Number(s ?? 0) * 1000 + Number(ms ?? 0));
  }
  const date = Date.parse(v);
  if (!Number.isNaN(date)) return Math.max(date - Date.now(), 0);
  return null;
}

export function retryAfterMs(headers: Headers): number | null {
  return parseDurationMs(headers.get("retry-after"));
}

/**
 * Reads `x-ratelimit-remaining-<requests|tokens><suffix>` headers (Groq
 * and Cerebras use this family; suffixes like `-day` / `-minute` name the
 * window). If any remaining count is zero, marks the target exhausted until
 * the matching `x-ratelimit-reset-...` value — or, if that is missing,
 * until the provider's daily reset (for `-day` windows) / one minute.
 * Providers that send no such headers simply never trigger this; their
 * 429s are handled by client.ts.
 */
export function noteResponseHeaders(key: string, provider: ProviderId, headers: Headers): void {
  headers.forEach((value, name) => {
    const m = /^x-ratelimit-remaining-(requests|tokens)(.*)$/.exec(name.toLowerCase());
    if (!m) return;
    if (!(Number(value) <= 0)) return;
    const resetName = `x-ratelimit-reset-${m[1]}${m[2] ?? ""}`;
    const fromHeader = parseDurationMs(headers.get(resetName));
    const isDaily = (m[2] ?? "").includes("day");
    const waitMs = fromHeader ?? (isDaily ? msUntilDailyReset(provider) : 60_000);
    markExhausted(key, waitMs + 250, `header:${name.toLowerCase()}`);
  });
}

// ---------------------------------------------------------------------------
// In-memory per-minute guard (only the discovery model uses it; see groqQuota.ts)
// ---------------------------------------------------------------------------

interface MinuteState {
  window: number;
  requests: number;
  tokens: number;
}
const minuteStates = new Map<string, MinuteState>();
const MINUTE_MS = 60_000;

function currentWindow(): number {
  return Math.floor(Date.now() / MINUTE_MS);
}

export function msUntilNextMinute(): number {
  return MINUTE_MS - (Date.now() % MINUTE_MS) + 50;
}

export function readMinute(key: string): { requests: number; tokens: number } {
  const s = minuteStates.get(key);
  if (!s || s.window !== currentWindow()) return { requests: 0, tokens: 0 };
  return { requests: s.requests, tokens: s.tokens };
}

export function commitMinute(key: string, tokens: number): void {
  const window = currentWindow();
  const s = minuteStates.get(key);
  if (!s || s.window !== window) minuteStates.set(key, { window, requests: 1, tokens });
  else {
    s.requests += 1;
    s.tokens += tokens;
  }
}

// ---------------------------------------------------------------------------
// (c) Daily totals in Supabase, batched
// ---------------------------------------------------------------------------

interface PendingRow {
  provider: ProviderId;
  day: string;
  scope: string;
  requests: number;
  tokens: number;
}

const rowKey = (day: string, provider: string, scope: string) => `${day}|${provider}|${scope}`;

const base = new Map<string, Totals>();
const pending = new Map<string, PendingRow>();
let pendingCalls = 0;
let baseLoadedAt = 0;
let lastLoadFailedAt = 0;
let lastFlushAt = Date.now();
let loading: Promise<void> | null = null;

async function loadBase(env: ValidatedEnv): Promise<void> {
  const days = [...new Set([dayKey("UTC"), dayKey("America/Los_Angeles")])];
  try {
    const { data, error } = await getSupabase(env)
      .from("ai_usage_daily")
      .select("provider, day, scope, requests, tokens_est")
      .in("day", days);
    if (error) throw error;
    base.clear();
    for (const r of (data ?? []) as Array<{ provider: string; day: string; scope: string; requests: number; tokens_est: number }>) {
      base.set(rowKey(r.day, r.provider, r.scope), { requests: Number(r.requests), tokens: Number(r.tokens_est) });
    }
    baseLoadedAt = Date.now();
  } catch (err) {
    // Fail open on accounting, never on the request: the provider's own 429s still protect the budget.
    lastLoadFailedAt = Date.now();
    logger.warn("ai_usage_load_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

async function ensureLoaded(env: ValidatedEnv, fresh: boolean): Promise<void> {
  const now = Date.now();
  const stale = fresh || now - baseLoadedAt > BASE_TTL_MS;
  if (!stale) return;
  if (!fresh && now - lastLoadFailedAt < LOAD_RETRY_MS) return;
  if (!loading) {
    loading = (async () => {
      // Push our own increments first so the reload doesn't undercount them.
      await flushAiUsage(env);
      await loadBase(env);
    })().finally(() => {
      loading = null;
    });
  }
  await loading;
}

/**
 * Today's totals for one provider + scope (scope "" = whole provider,
 * "model:<id>" = one model, "phase:<name>" = one discovery phase), including
 * increments not yet flushed. Reads Supabase at most once per BASE_TTL_MS.
 */
export async function readUsage(
  env: ValidatedEnv,
  provider: ProviderId,
  scope = "",
  options: { fresh?: boolean } = {},
): Promise<Totals> {
  await ensureLoaded(env, options.fresh === true);
  const key = rowKey(dayKeyFor(provider), provider, scope);
  const b = base.get(key);
  const p = pending.get(key);
  return { requests: (b?.requests ?? 0) + (p?.requests ?? 0), tokens: (b?.tokens ?? 0) + (p?.tokens ?? 0) };
}

/** Writes all pending increments in ONE RPC. Never throws; on failure the increments are kept for the next flush. */
export async function flushAiUsage(env: ValidatedEnv): Promise<void> {
  await flushProviderStatus(env);
  if (pending.size === 0) return;
  const rows = [...pending.values()];
  pending.clear();
  pendingCalls = 0;
  lastFlushAt = Date.now();
  // Optimistically fold into the cached baseline so readers don't see a dip mid-flush.
  for (const r of rows) {
    const k = rowKey(r.day, r.provider, r.scope);
    const b = base.get(k) ?? { requests: 0, tokens: 0 };
    base.set(k, { requests: b.requests + r.requests, tokens: b.tokens + r.tokens });
  }
  try {
    const { error } = await getSupabase(env).rpc("ai_usage_bump", { p_rows: rows });
    if (error) throw error;
  } catch (err) {
    logger.warn("ai_usage_flush_failed", { rows: rows.length, error: err instanceof Error ? err.message : String(err) });
    for (const r of rows) {
      const k = rowKey(r.day, r.provider, r.scope);
      const b = base.get(k);
      if (b) base.set(k, { requests: Math.max(b.requests - r.requests, 0), tokens: Math.max(b.tokens - r.tokens, 0) });
      const p = pending.get(k);
      if (p) {
        p.requests += r.requests;
        p.tokens += r.tokens;
      } else pending.set(k, { ...r });
    }
  }
}

/**
 * Writes queued exhaustion/last-error events in ONE RPC. Best effort: a failed
 * write is logged and dropped (the in-memory map still protects this isolate;
 * the admin panel just misses one event).
 */
export async function flushProviderStatus(env: ValidatedEnv): Promise<void> {
  if (statusPending.size === 0) return;
  const rows = [...statusPending.entries()].map(([key, p]) => {
    const i = key.indexOf(":");
    return {
      key,
      provider: key.slice(0, i),
      model: key.slice(i + 1),
      exhausted_until: p.exhaustedUntil ? new Date(p.exhaustedUntil).toISOString() : null,
      exhausted_reason: p.exhaustedReason ?? null,
      last_error_class: p.errorClass ?? null,
      last_error_at: p.errorAt ? new Date(p.errorAt).toISOString() : null,
    };
  });
  statusPending.clear();
  lastStatusFlushAt = Date.now();
  try {
    const { error } = await getSupabase(env).rpc("ai_provider_status_bump", { p_rows: rows });
    if (error) throw error;
  } catch (err) {
    logger.warn("ai_provider_status_flush_failed", { rows: rows.length, error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Called by client.ts when a provider call finished. If failures are waiting
 * and the last write was more than STATUS_FLUSH_MIN_MS ago, flushes status +
 * usage counters (via ctx.waitUntil when there is one). No-op otherwise, so a
 * healthy run pays nothing.
 */
export async function flushAiEvents(env: ValidatedEnv, ctx?: ExecutionContext): Promise<void> {
  if (statusPending.size === 0 || Date.now() - lastStatusFlushAt < STATUS_FLUSH_MIN_MS) return;
  const work = flushAiUsage(env);
  if (ctx) ctx.waitUntil(work);
  else await work;
}

/**
 * Records one successful call. Adds to the whole-provider row, the model
 * row, and (for discovery) the phase row — all flushed together in a
 * single RPC. `ctx.waitUntil` is used when available so a user-facing
 * request never waits on the write.
 */
export async function recordUsage(
  env: ValidatedEnv,
  call: { provider: ProviderId; model: string; tokens: number; phase?: string },
  ctx?: ExecutionContext,
): Promise<void> {
  const day = dayKeyFor(call.provider);
  const scopes = ["", `model:${call.model}`, ...(call.phase ? [`phase:${call.phase}`] : [])];
  for (const scope of scopes) {
    const k = rowKey(day, call.provider, scope);
    const row = pending.get(k);
    if (row) {
      row.requests += 1;
      row.tokens += call.tokens;
    } else pending.set(k, { provider: call.provider, day, scope, requests: 1, tokens: call.tokens });
  }
  pendingCalls += 1;

  if (pendingCalls >= FLUSH_EVERY || Date.now() - lastFlushAt > FLUSH_MAX_AGE_MS) {
    const work = flushAiUsage(env);
    if (ctx) ctx.waitUntil(work);
    else await work;
  }
}
