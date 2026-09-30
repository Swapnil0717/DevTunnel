import { logger } from "./logger";
import type { ValidatedEnv } from "../config/env";
import { getSupabase } from "./supabase";
import type { GroqQuotaSnapshot } from "../types";
import {
  estimateTokens,
  msUntilNextMinute,
  msUntilUtcMidnight,
  readMinute,
  readUsage,
  commitMinute,
} from "./ai/usage";

/**
 * Governs the AI Discovery agent's use of Groq's free-tier caps for the
 * model configured in GROQ_MODEL (currently `openai/gpt-oss-120b`: 30
 * requests/minute, 1,000 requests/day, 8,000 tokens/minute, 200,000
 * tokens/day), including the admin-editable 25/25/50 projects/tools/tasks
 * split of the daily budget.
 *
 * REWRITTEN (AI foundation, Part 1): this file used to keep SIX Workers KV
 * counters per Groq call (account rpd/tpd, phase rpd/tpd, rpm, tpm) — about
 * 600 KV writes per discovery run against the Free plan's 1,000 writes/DAY.
 * It now has ZERO KV writes:
 *   - daily + per-phase totals come from Supabase `ai_usage_daily`
 *     (batched by src/lib/ai/usage.ts, cached in memory);
 *   - the per-minute request/token guard is in memory (one discovery run =
 *     one isolate, so it sees all of its own calls);
 *   - the admin split moved from KV to Supabase `ai_settings`.
 * See src/lib/ai/usage.ts for the trade-offs this implies.
 *
 * Every export other files import is preserved (same names, same error
 * class and fields) except that functions needing storage now take `env`
 * instead of a KV namespace. A READ-ONLY fallback to the old KV split
 * (`groq:phase_budget_shares`) exists so an admin's custom split is not
 * silently lost the first time this ships; reads don't count against KV's
 * write cap, and the fallback disappears the moment the split is saved once.
 *
 * Deliberately conservative — real limits minus a safety margin.
 */

/** Groq's real free-tier cap (openai/gpt-oss-120b) is 30/minute; reserve under it. */
export const GROQ_RPM_LIMIT = 25;
/** Groq's real free-tier cap is 1,000/day; reserve under it. */
export const GROQ_RPD_LIMIT = 900;
/** Groq's real free-tier cap is 8,000 tokens/minute — the actual binding constraint. */
export const GROQ_TPM_LIMIT = 6500;
/** Groq's real free-tier cap is 200,000 tokens/day. */
export const GROQ_TPD_LIMIT = 180000;

export { estimateTokens };

/**
 * Discovery is one shared Groq key split three ways — projects, tools, and
 * tasks (issues) — so a chatty projects run can never crowd out the day's
 * tools or tasks, and vice versa. These are FRACTIONS of the daily limits
 * above, never a second independent cap: the model-wide daily totals still
 * apply on top, so no phase can push the account past Groq's ceiling.
 */
export type DiscoveryPhase = "projects" | "tools" | "tasks";

/** Fallback split until an admin sets one via `PUT /admin/ai/budget`, and whenever the stored one is missing or malformed. */
export const DEFAULT_PHASE_BUDGET_SHARE: Record<DiscoveryPhase, number> = {
  projects: 0.25,
  tools: 0.25,
  tasks: 0.5,
};

/**
 * Phases run projects -> tools -> tasks (enforced by `runDailyDiscovery`);
 * this array keeps the admin quota panel's breakdown in that same order.
 */
export const PHASE_SPEND_ORDER: DiscoveryPhase[] = ["projects", "tools", "tasks"];

const SETTINGS_KEY = "phase_budget_shares";
/** Legacy KV key — read-only fallback (see file comment). */
const LEGACY_KV_KEY = "groq:phase_budget_shares";
const SHARE_SUM_TOLERANCE = 0.005;
const SHARES_CACHE_MS = 60_000;

function isValidShareSet(value: unknown): value is Record<DiscoveryPhase, number> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  let sum = 0;
  for (const phase of PHASE_SPEND_ORDER) {
    const share = record[phase];
    if (typeof share !== "number" || !Number.isFinite(share) || share < 0 || share > 1) return false;
    sum += share;
  }
  return Math.abs(sum - 1) <= SHARE_SUM_TOLERANCE;
}

/** Thrown by `setPhaseBudgetShares` when the split isn't three 0-1 fractions summing to 1. */
export class InvalidPhaseBudgetSharesError extends Error {
  constructor() {
    super("Budget percentages must each be between 0 and 100, and add up to exactly 100");
    this.name = "InvalidPhaseBudgetSharesError";
  }
}

let sharesCache: { value: Record<DiscoveryPhase, number>; at: number } | null = null;

/**
 * Reads the admin-configured projects/tools/tasks split. Order: Supabase
 * `ai_settings` -> legacy KV value (read-only) -> DEFAULT. Anything that
 * fails validation falls back to the default so no phase (or all three
 * combined) can claim more than 100% of the daily budget.
 */
export async function getPhaseBudgetShares(
  env: ValidatedEnv,
  legacyKv?: KVNamespace,
): Promise<Record<DiscoveryPhase, number>> {
  if (sharesCache && Date.now() - sharesCache.at < SHARES_CACHE_MS) return sharesCache.value;
  let value = DEFAULT_PHASE_BUDGET_SHARE;
  try {
    const { data, error } = await getSupabase(env).from("ai_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
    if (error) throw error;
    if (data) {
      if (isValidShareSet(data.value)) value = data.value;
      else logger.warn("groq_phase_shares_invalid_stored_value", { stored: JSON.stringify(data.value).slice(0, 200) });
    } else if (legacyKv) {
      const raw = await legacyKv.get(LEGACY_KV_KEY); // read only — never a write
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isValidShareSet(parsed)) value = parsed;
      }
    }
  } catch (err) {
    logger.error("groq_phase_shares_read_failed", { error: err instanceof Error ? err.message : String(err) });
    // Don't cache a failure result for a minute — but do return the safe default.
    return DEFAULT_PHASE_BUDGET_SHARE;
  }
  sharesCache = { value, at: Date.now() };
  return value;
}

/**
 * Persists a new split (fractions 0-1 summing to 1) to Supabase. Takes
 * effect immediately in this isolate and within SHARES_CACHE_MS elsewhere;
 * it re-slices whatever is LEFT today and never resets any counters.
 */
export async function setPhaseBudgetShares(
  env: ValidatedEnv,
  shares: Record<DiscoveryPhase, number>,
): Promise<Record<DiscoveryPhase, number>> {
  if (!isValidShareSet(shares)) throw new InvalidPhaseBudgetSharesError();
  const { error } = await getSupabase(env)
    .from("ai_settings")
    .upsert({ key: SETTINGS_KEY, value: shares, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`ai_settings upsert failed: ${error.message}`);
  sharesCache = { value: shares, at: Date.now() };
  logger.info("groq_phase_shares_updated", { shares });
  return shares;
}

function phaseLimit(totalLimit: number, phase: DiscoveryPhase, shares: Record<DiscoveryPhase, number>): number {
  return Math.max(1, Math.floor(totalLimit * shares[phase]));
}

export type GroqQuotaReason = "rpm" | "rpd" | "tpm" | "tpd" | "rpd_phase" | "tpd_phase";

/**
 * Thrown by `reserveGroqRequest` (and, via groq.ts, when every AI provider
 * is exhausted). `rpd`/`tpd` = today's model-wide budget is spent;
 * `rpd_phase`/`tpd_phase` = this phase used up its own share; `rpm`/`tpm` =
 * the per-minute window is full even after the internal wait. Discovery
 * catches this specifically and stops early instead of retrying.
 */
export class GroqQuotaExceededError extends Error {
  reason: GroqQuotaReason;
  retryAfterMs: number;
  phase?: DiscoveryPhase;

  constructor(reason: GroqQuotaReason, retryAfterMs: number, phase?: DiscoveryPhase) {
    const label =
      reason === "rpd" || reason === "tpd" ? "daily" : reason === "rpd_phase" || reason === "tpd_phase" ? `daily ${phase}` : "per-minute";
    const unit = reason === "rpm" || reason === "rpd" || reason === "rpd_phase" ? "request" : "token";
    super(`Groq ${label} ${unit} quota exhausted`);
    this.name = "GroqQuotaExceededError";
    this.reason = reason;
    this.phase = phase;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Accounting scope for the discovery model's whole-day totals (see usage.ts). */
const modelScope = (env: ValidatedEnv) => `model:${env.GROQ_MODEL}`;
const minuteKey = (env: ValidatedEnv) => `groq:${env.GROQ_MODEL}`;

/**
 * Checks (and, in memory, reserves) budget for ONE outbound Groq discovery
 * request estimated at `estimatedTokens`. Call immediately before the
 * fetch. Checks the model-wide daily totals, this phase's own share, and the
 * in-memory per-minute window. Waits out a short minute window itself (up
 * to `maxWaitAttempts` times); throws `GroqQuotaExceededError` immediately
 * once a daily budget is gone. Daily usage is RECORDED after the call
 * succeeds (client.ts -> recordUsage), not here.
 */
export async function reserveGroqRequest(
  env: ValidatedEnv,
  estimatedTokens: number,
  phase: DiscoveryPhase,
  options: { maxWaitAttempts?: number; legacyKv?: KVNamespace } = {},
): Promise<void> {
  const maxWaitAttempts = options.maxWaitAttempts ?? 2;

  // A request this large can never fit even an empty minute window. Logged
  // as requestSizeEstimate (logger.ts redacts any field containing "token").
  if (estimatedTokens > GROQ_TPM_LIMIT) {
    logger.error("groq_request_exceeds_tpm_budget", { requestSizeEstimate: estimatedTokens, limit: GROQ_TPM_LIMIT });
    throw new GroqQuotaExceededError("tpm", msUntilNextMinute());
  }

  const shares = await getPhaseBudgetShares(env, options.legacyKv);
  const phaseRpdLimit = phaseLimit(GROQ_RPD_LIMIT, phase, shares);
  const phaseTpdLimit = phaseLimit(GROQ_TPD_LIMIT, phase, shares);

  for (let attempt = 0; attempt <= maxWaitAttempts; attempt++) {
    const model = await readUsage(env, "groq", modelScope(env));
    if (model.requests >= GROQ_RPD_LIMIT) throw new GroqQuotaExceededError("rpd", msUntilUtcMidnight());
    if (model.tokens + estimatedTokens > GROQ_TPD_LIMIT) throw new GroqQuotaExceededError("tpd", msUntilUtcMidnight());

    const phaseUsed = await readUsage(env, "groq", `phase:${phase}`);
    if (phaseUsed.requests >= phaseRpdLimit) throw new GroqQuotaExceededError("rpd_phase", msUntilUtcMidnight(), phase);
    if (phaseUsed.tokens + estimatedTokens > phaseTpdLimit) throw new GroqQuotaExceededError("tpd_phase", msUntilUtcMidnight(), phase);

    const minute = readMinute(minuteKey(env));
    const rpmBlocked = minute.requests >= GROQ_RPM_LIMIT;
    const tpmBlocked = minute.tokens + estimatedTokens > GROQ_TPM_LIMIT;
    if (rpmBlocked || tpmBlocked) {
      if (attempt >= maxWaitAttempts) throw new GroqQuotaExceededError(tpmBlocked ? "tpm" : "rpm", msUntilNextMinute());
      const waitMs = msUntilNextMinute();
      logger.warn("groq_quota_minute_wait", { waitMs, attempt, rpmBlocked, tpmBlocked, phase });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    commitMinute(minuteKey(env), estimatedTokens);
    return;
  }
}

/**
 * Read-only snapshot for the admin quota panel — same shape as before.
 * Daily numbers come from Supabase (fresh read); "this minute" numbers come
 * from this isolate's memory (see usage.ts for why they are usually 0 here).
 */
export async function getGroqQuotaSnapshot(env: ValidatedEnv, legacyKv?: KVNamespace): Promise<GroqQuotaSnapshot> {
  const model = await readUsage(env, "groq", modelScope(env), { fresh: true });
  const minute = readMinute(minuteKey(env));
  const shares = await getPhaseBudgetShares(env, legacyKv);

  // Account-wide ceiling for the rest of today — the hard cap reserveGroqRequest
  // enforces before any phase counter. A phase can never display more remaining
  // than the account it draws from actually has left.
  const accountRpdRemaining = Math.max(GROQ_RPD_LIMIT - model.requests, 0);
  const accountTpdRemaining = Math.max(GROQ_TPD_LIMIT - model.tokens, 0);

  const phases = await Promise.all(
    PHASE_SPEND_ORDER.map(async (phase) => {
      const rpdLimit = phaseLimit(GROQ_RPD_LIMIT, phase, shares);
      const tpdLimit = phaseLimit(GROQ_TPD_LIMIT, phase, shares);
      const used = await readUsage(env, "groq", `phase:${phase}`);
      return {
        phase,
        sharePct: Math.round(shares[phase] * 100),
        limitPerDay: rpdLimit,
        usedToday: used.requests,
        remainingToday: Math.min(Math.max(rpdLimit - used.requests, 0), accountRpdRemaining),
        tokenLimitPerDay: tpdLimit,
        tokensUsedToday: used.tokens,
        tokensRemainingToday: Math.min(Math.max(tpdLimit - used.tokens, 0), accountTpdRemaining),
      };
    }),
  );

  return {
    limitPerMinute: GROQ_RPM_LIMIT,
    usedThisMinute: minute.requests,
    remainingThisMinute: Math.max(GROQ_RPM_LIMIT - minute.requests, 0),
    limitPerDay: GROQ_RPD_LIMIT,
    usedToday: model.requests,
    remainingToday: accountRpdRemaining,
    tokenLimitPerMinute: GROQ_TPM_LIMIT,
    tokensUsedThisMinute: minute.tokens,
    tokensRemainingThisMinute: Math.max(GROQ_TPM_LIMIT - minute.tokens, 0),
    tokenLimitPerDay: GROQ_TPD_LIMIT,
    tokensUsedToday: model.tokens,
    tokensRemainingToday: accountTpdRemaining,
    dailyResetsAt: new Date(Date.now() + msUntilUtcMidnight()).toISOString(),
    phases,
  };
}

/**
 * True once a phase can make no more Groq calls today — its own daily
 * request share OR token share (whichever binds first) has hit zero.
 */
export function isPhaseBudgetExhausted(phase: { remainingToday: number; tokensRemainingToday: number }): boolean {
  return phase.remainingToday <= 0 || phase.tokensRemainingToday <= 0;
}

/**
 * True once a phase has spent at least `thresholdPct` (0-1) of its own daily
 * share — a looser trigger than `isPhaseBudgetExhausted`'s "hit zero".
 */
export function isPhaseBudgetMostlySpent(
  phase: { limitPerDay: number; usedToday: number; tokenLimitPerDay: number; tokensUsedToday: number },
  thresholdPct: number,
): boolean {
  const requestsSpentPct = phase.limitPerDay > 0 ? phase.usedToday / phase.limitPerDay : 1;
  const tokensSpentPct = phase.tokenLimitPerDay > 0 ? phase.tokensUsedToday / phase.tokenLimitPerDay : 1;
  return requestsSpentPct >= thresholdPct || tokensSpentPct >= thresholdPct;
}
