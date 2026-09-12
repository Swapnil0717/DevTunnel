import { logger } from "./logger";
import type { GroqQuotaSnapshot } from "../types";

/**
 * Governs every outbound call to the Groq API against Groq's free-tier
 * caps for the model configured in GROQ_MODEL (wrangler.toml — currently
 * `openai/gpt-oss-120b`). Groq's own console (Settings -> Limits) shows
 * that model's free tier as 30 requests/minute, 1,000 requests/day,
 * 8,000 tokens/minute, and 200,000 tokens/day.
 *
 * Request-count-wise this is vastly more headroom than the previous
 * Gemini setup (5 RPM / 20 RPD) ever gave this agent — but the
 * TOKENS-per-minute cap (8K) is genuinely tight for this workload: a
 * single turn's payload can include a 3-6KB README, several tool
 * results, and the full growing conversation history re-sent on every
 * turn. That's why this governor tracks tokens, not just requests —
 * unlike geminiQuota.ts (its predecessor), which never needed to because
 * Gemini's TPM ceiling was in the hundreds of thousands.
 *
 * `src/lib/groq.ts` reserves budget here BEFORE every physical fetch to
 * the Groq API — nothing in this codebase calls Groq without going
 * through `reserveGroqRequest` first. Uses the same KV namespace
 * `src/lib/rateLimit.ts` already uses for request rate limiting (no new
 * infrastructure), with its own key prefix (`groq:rpm:` / `groq:rpd:` /
 * `groq:tpm:` / `groq:tpd:`) so none of them collide.
 *
 * Deliberately conservative — real limits minus a safety margin — so a
 * concurrent request, a fixed-window boundary race, or an under-estimate
 * of a request's token count still lands under Groq's real caps instead
 * of tripping them.
 */

/** Groq's real free-tier cap (openai/gpt-oss-120b) is 30/minute; reserve under it. */
export const GROQ_RPM_LIMIT = 25;
/** Groq's real free-tier cap is 1,000/day; reserve under it. */
export const GROQ_RPD_LIMIT = 900;
/** Groq's real free-tier cap is 8,000 tokens/minute — the actual binding constraint. */
export const GROQ_TPM_LIMIT = 6500;
/** Groq's real free-tier cap is 200,000 tokens/day. */
export const GROQ_TPD_LIMIT = 180000;

const RPM_WINDOW_SECONDS = 60;

export type GroqQuotaReason = "rpm" | "rpd" | "tpm" | "tpd";

/**
 * Thrown by `reserveGroqRequest` when there is no budget left to wait
 * out. `reason: "rpd"` / `"tpd"` means today's daily budget (requests or
 * tokens) is fully spent — the caller must stop entirely, not retry,
 * since nothing frees up until UTC midnight. `reason: "rpm"` / `"tpm"`
 * means the per-minute window is exhausted even after this function's
 * own internal wait — rare in practice, since `reserveGroqRequest`
 * already waits out short per-minute windows itself before throwing for
 * either of these two reasons.
 */
export class GroqQuotaExceededError extends Error {
  reason: GroqQuotaReason;
  retryAfterMs: number;

  constructor(reason: GroqQuotaReason, retryAfterMs: number) {
    const label = reason === "rpd" || reason === "tpd" ? "daily" : "per-minute";
    const unit = reason === "rpm" || reason === "rpd" ? "request" : "token";
    super(`Groq ${label} ${unit} quota exhausted`);
    this.name = "GroqQuotaExceededError";
    this.reason = reason;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Very rough token estimate (chars / 3.5) used purely to ration the
 * TPM/TPD budget before a call goes out — not meant to match Groq's own
 * tokenizer exactly. Errs conservative (slightly over-counts) since
 * under-estimating is what actually causes a 429.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function minuteWindow(): number {
  return Math.floor(Date.now() / 1000 / RPM_WINDOW_SECONDS);
}

function msUntilNextMinuteWindow(): number {
  const windowMs = RPM_WINDOW_SECONDS * 1000;
  return windowMs - (Date.now() % windowMs) + 50;
}

function msUntilNextUtcMidnight(): number {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  return next.getTime() - now.getTime();
}

async function readCounter(kv: KVNamespace, key: string): Promise<number> {
  try {
    return Number((await kv.get(key)) ?? "0");
  } catch (err) {
    logger.error("groq_quota_read_failed", { key, error: String(err) });
    return 0;
  }
}

async function incrementCounter(kv: KVNamespace, key: string, amount: number, ttlSeconds: number): Promise<void> {
  const current = await readCounter(kv, key);
  await kv.put(key, String(current + amount), { expirationTtl: Math.max(Math.ceil(ttlSeconds), 60) });
}

/**
 * Reserves budget for exactly one outbound Groq request estimated to cost
 * `estimatedTokens` tokens. Call this immediately before every real fetch
 * to the Groq API — never after.
 *
 * Resolves once budget exists on all four dimensions (RPM, RPD, TPM, TPD),
 * waiting out a short per-minute window itself (up to `maxWaitAttempts`
 * times) when only RPM or TPM is the blocker. Throws
 * `GroqQuotaExceededError` immediately, with no wait, the moment RPD or
 * TPD is gone for the day — the caller must stop rather than retry.
 */
export async function reserveGroqRequest(kv: KVNamespace, estimatedTokens: number, maxWaitAttempts = 2): Promise<void> {
  // A request this large can never fit, even against a fully empty
  // minute window — waiting out attempts below would just burn ~2
  // minutes before failing anyway. This is what an over-sized
  // conversation payload (e.g. an oversized tool result appended to
  // history) looks like; fail immediately with a distinct log so it's
  // obvious this is a payload-size problem, not ordinary rate limiting.
  if (estimatedTokens > GROQ_TPM_LIMIT) {
    // Logged as requestSizeEstimate, not estimatedTokens — logger.ts
    // redacts any field name containing "token" (to catch real secrets),
    // which would otherwise hide this harmless number right when it's
    // most useful for debugging an oversized-prompt failure like this one.
    logger.error("groq_request_exceeds_tpm_budget", { requestSizeEstimate: estimatedTokens, limit: GROQ_TPM_LIMIT });
    throw new GroqQuotaExceededError("tpm", msUntilNextMinuteWindow());
  }

  const rpdKey = `groq:rpd:${todayKey()}`;
  const tpdKey = `groq:tpd:${todayKey()}`;

  for (let attempt = 0; attempt <= maxWaitAttempts; attempt++) {
    const usedToday = await readCounter(kv, rpdKey);
    if (usedToday >= GROQ_RPD_LIMIT) {
      throw new GroqQuotaExceededError("rpd", msUntilNextUtcMidnight());
    }

    const tokensToday = await readCounter(kv, tpdKey);
    if (tokensToday + estimatedTokens > GROQ_TPD_LIMIT) {
      throw new GroqQuotaExceededError("tpd", msUntilNextUtcMidnight());
    }

    const rpmKey = `groq:rpm:${minuteWindow()}`;
    const tpmKey = `groq:tpm:${minuteWindow()}`;
    const usedThisMinute = await readCounter(kv, rpmKey);
    const tokensThisMinute = await readCounter(kv, tpmKey);

    const rpmBlocked = usedThisMinute >= GROQ_RPM_LIMIT;
    const tpmBlocked = tokensThisMinute + estimatedTokens > GROQ_TPM_LIMIT;

    if (rpmBlocked || tpmBlocked) {
      if (attempt >= maxWaitAttempts) {
        throw new GroqQuotaExceededError(tpmBlocked ? "tpm" : "rpm", msUntilNextMinuteWindow());
      }
      const waitMs = msUntilNextMinuteWindow();
      logger.warn("groq_quota_minute_wait", { waitMs, attempt, rpmBlocked, tpmBlocked });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    await incrementCounter(kv, rpdKey, 1, msUntilNextUtcMidnight() / 1000);
    await incrementCounter(kv, tpdKey, estimatedTokens, msUntilNextUtcMidnight() / 1000);
    await incrementCounter(kv, rpmKey, 1, RPM_WINDOW_SECONDS + 5);
    await incrementCounter(kv, tpmKey, estimatedTokens, RPM_WINDOW_SECONDS + 5);
    return;
  }
}

/** Read-only snapshot for the admin frontend's quota panel — never reserves anything. */
export async function getGroqQuotaSnapshot(kv: KVNamespace): Promise<GroqQuotaSnapshot> {
  const usedToday = await readCounter(kv, `groq:rpd:${todayKey()}`);
  const usedThisMinute = await readCounter(kv, `groq:rpm:${minuteWindow()}`);
  const tokensToday = await readCounter(kv, `groq:tpd:${todayKey()}`);
  const tokensThisMinute = await readCounter(kv, `groq:tpm:${minuteWindow()}`);

  return {
    limitPerMinute: GROQ_RPM_LIMIT,
    usedThisMinute,
    remainingThisMinute: Math.max(GROQ_RPM_LIMIT - usedThisMinute, 0),
    limitPerDay: GROQ_RPD_LIMIT,
    usedToday,
    remainingToday: Math.max(GROQ_RPD_LIMIT - usedToday, 0),
    tokenLimitPerMinute: GROQ_TPM_LIMIT,
    tokensUsedThisMinute: tokensThisMinute,
    tokensRemainingThisMinute: Math.max(GROQ_TPM_LIMIT - tokensThisMinute, 0),
    tokenLimitPerDay: GROQ_TPD_LIMIT,
    tokensUsedToday: tokensToday,
    tokensRemainingToday: Math.max(GROQ_TPD_LIMIT - tokensToday, 0),
    dailyResetsAt: new Date(Date.now() + msUntilNextUtcMidnight()).toISOString(),
  };
}