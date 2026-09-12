import { logger } from "./logger";

/**
 * Governs every outbound call to the Gemini API against Google's free-tier
 * caps for the model configured in GEMINI_MODEL (wrangler.toml —
 * currently `gemini-3.6-flash`). Google AI Studio's own Rate Limit page
 * shows that model's free tier as 5 requests/minute and 20 requests/day —
 * and the same page showed this project already over both (6/5 RPM,
 * 21/20 RPD), which is exactly what was producing the 429/503 errors
 * visible on the Usage page.
 *
 * `src/lib/gemini.ts` reserves budget here BEFORE every physical fetch to
 * the Gemini API — nothing in this codebase calls Gemini without going
 * through `reserveGeminiRequest` first. Uses the same KV namespace
 * `src/lib/rateLimit.ts` already uses for request rate limiting (no new
 * infrastructure), with its own key prefix (`gemini:rpm:` / `gemini:rpd:`)
 * so the two never collide.
 *
 * Deliberately conservative — real limits minus a safety margin — so a
 * concurrent request or a fixed-window boundary race (the same
 * documented limitation `rateLimit.ts`'s counter already accepts) still
 * lands under Google's real caps instead of tripping them.
 */

/** Google's real free-tier cap is 5/minute; reserve under it for safety margin. */
export const GEMINI_RPM_LIMIT = 4;
/** Google's real free-tier cap is 20/day; reserve under it for safety margin. */
export const GEMINI_RPD_LIMIT = 18;

const RPM_WINDOW_SECONDS = 60;

export type GeminiQuotaReason = "rpm" | "rpd";

/**
 * Thrown by `reserveGeminiRequest` when there is no budget left to wait
 * out. `reason: "rpd"` means today's daily budget is fully spent — the
 * caller must stop entirely, not retry, since nothing frees up until UTC
 * midnight. `reason: "rpm"` means the per-minute window is exhausted
 * even after this function's own internal wait — extremely rare in
 * practice, since `reserveGeminiRequest` already waits out short RPM
 * windows itself before ever throwing for this reason.
 */
export class GeminiQuotaExceededError extends Error {
  reason: GeminiQuotaReason;
  retryAfterMs: number;

  constructor(reason: GeminiQuotaReason, retryAfterMs: number) {
    super(reason === "rpd" ? "Gemini daily request quota exhausted" : "Gemini per-minute request quota exhausted");
    this.name = "GeminiQuotaExceededError";
    this.reason = reason;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Read-only snapshot for the admin frontend's quota panel — mirrors devtunnel-frontend's GeminiQuotaSnapshot type field-for-field. */
export interface GeminiQuotaSnapshot {
  limitPerMinute: number;
  usedThisMinute: number;
  remainingThisMinute: number;
  limitPerDay: number;
  usedToday: number;
  remainingToday: number;
  /** ISO timestamp of the next UTC midnight, when the daily counter resets. */
  dailyResetsAt: string;
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
    // Fail open on KV outages, same posture as lib/rateLimit.ts — but log
    // loudly, since a silently-failing quota check could let this feature
    // quietly stop protecting the account (rule 21: never swallow errors).
    logger.error("gemini_quota_read_failed", { key, error: String(err) });
    return 0;
  }
}

async function incrementCounter(kv: KVNamespace, key: string, ttlSeconds: number): Promise<void> {
  const current = await readCounter(kv, key);
  await kv.put(key, String(current + 1), { expirationTtl: Math.max(Math.ceil(ttlSeconds), 60) });
}

/**
 * Reserves budget for exactly one outbound Gemini request. Call this
 * immediately before every real fetch to the Gemini API — never after.
 *
 * Resolves once budget exists, waiting out a short RPM window itself
 * (up to `maxWaitAttempts` times) when only the per-minute limit is the
 * blocker. Throws `GeminiQuotaExceededError("rpd", ...)` immediately,
 * with no wait, the moment today's daily budget is gone — the caller
 * must stop rather than retry.
 */
export async function reserveGeminiRequest(kv: KVNamespace, maxWaitAttempts = 2): Promise<void> {
  const dayKey = `gemini:rpd:${todayKey()}`;

  for (let attempt = 0; attempt <= maxWaitAttempts; attempt++) {
    const usedToday = await readCounter(kv, dayKey);
    if (usedToday >= GEMINI_RPD_LIMIT) {
      throw new GeminiQuotaExceededError("rpd", msUntilNextUtcMidnight());
    }

    const minuteKey = `gemini:rpm:${minuteWindow()}`;
    const usedThisMinute = await readCounter(kv, minuteKey);
    if (usedThisMinute >= GEMINI_RPM_LIMIT) {
      if (attempt >= maxWaitAttempts) {
        throw new GeminiQuotaExceededError("rpm", msUntilNextMinuteWindow());
      }
      const waitMs = msUntilNextMinuteWindow();
      logger.warn("gemini_quota_rpm_wait", { waitMs, attempt });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    // Reserve both windows together. Not perfectly atomic (same
    // documented limitation rateLimit.ts's fixed-window counter already
    // accepts), but the conservative limits above leave enough margin
    // that a rare double-increment race still stays under Google's real
    // caps.
    await incrementCounter(kv, dayKey, msUntilNextUtcMidnight() / 1000);
    await incrementCounter(kv, minuteKey, RPM_WINDOW_SECONDS + 5);
    return;
  }
}

/** Read-only snapshot for the admin frontend's quota panel — never reserves anything. */
export async function getGeminiQuotaSnapshot(kv: KVNamespace): Promise<GeminiQuotaSnapshot> {
  const usedToday = await readCounter(kv, `gemini:rpd:${todayKey()}`);
  const usedThisMinute = await readCounter(kv, `gemini:rpm:${minuteWindow()}`);

  return {
    limitPerMinute: GEMINI_RPM_LIMIT,
    usedThisMinute,
    remainingThisMinute: Math.max(GEMINI_RPM_LIMIT - usedThisMinute, 0),
    limitPerDay: GEMINI_RPD_LIMIT,
    usedToday,
    remainingToday: Math.max(GEMINI_RPD_LIMIT - usedToday, 0),
    dailyResetsAt: new Date(Date.now() + msUntilNextUtcMidnight()).toISOString(),
  };
}