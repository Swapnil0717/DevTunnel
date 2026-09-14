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

/**
 * Discovery is one shared Groq key split three ways — projects, tools,
 * and tasks (issues) — so that a chatty projects run can never crowd out
 * the day's tools or tasks entirely, and vice versa. Per product
 * direction: projects and tools each get a quarter of the daily
 * request/token budget, tasks/issues get the other half (there is
 * usually far more issue volume across every onboarded project than
 * there is "new project" or "new tool" volume). These are FRACTIONS of
 * GROQ_RPD_LIMIT/GROQ_TPD_LIMIT above, never a second, independent cap —
 * the global daily counters below still apply on top of these, so no
 * phase can ever push the account over Groq's real ceiling even if the
 * shares below were misconfigured to sum past 1.
 */
export type DiscoveryPhase = "projects" | "tools" | "tasks";

/**
 * Fallback split used until an admin sets a custom one via
 * `PUT /admin/ai/budget` (routes/admin/ai.ts), and whenever whatever's
 * stored in KV is missing or malformed. Matches the original hardcoded
 * 25/25/50 product direction.
 */
export const DEFAULT_PHASE_BUDGET_SHARE: Record<DiscoveryPhase, number> = {
  projects: 0.25,
  tools: 0.25,
  tasks: 0.5,
};

/**
 * Admins spend the projects+tools half of the budget FIRST, tasks second
 * — never the other way around. This is enforced by
 * `runDailyDiscovery`'s phase order (aiDiscoveryAgent.ts), not here; this
 * array exists so `getGroqQuotaSnapshot`'s phase breakdown is reported in
 * the same order the phases actually run in, for the admin quota panel.
 */
export const PHASE_SPEND_ORDER: DiscoveryPhase[] = ["projects", "tools", "tasks"];

/**
 * Persistent (no TTL — this is a setting, not a daily counter) KV key
 * holding the admin-configured projects/tools/tasks split, as fractions
 * that sum to 1. Separate key namespace from every `groq:rpd:*` /
 * `groq:tpd:*` counter above so it's never touched by the daily
 * expirationTtl those use.
 */
const PHASE_BUDGET_SHARE_KV_KEY = "groq:phase_budget_shares";

/** How far a stored/submitted share set's total may drift from exactly 1 (100%) before being rejected — accounts for float rounding, not sloppy input. */
const SHARE_SUM_TOLERANCE = 0.005;

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

/** Thrown by `setPhaseBudgetShares` when the submitted split isn't three 0-1 fractions summing to 1 (i.e. three 0-100 percentages summing to 100). */
export class InvalidPhaseBudgetSharesError extends Error {
  constructor() {
    super("Budget percentages must each be between 0 and 100, and add up to exactly 100");
    this.name = "InvalidPhaseBudgetSharesError";
  }
}

/**
 * Reads the admin-configured projects/tools/tasks Groq budget split.
 * Falls back to `DEFAULT_PHASE_BUDGET_SHARE` whenever nothing has been
 * set yet, or the stored value fails validation — `reserveGroqRequest`
 * and `getGroqQuotaSnapshot` must never operate on a split that could let
 * a phase (or all three combined) claim more than 100% of the daily
 * account-wide budget.
 */
export async function getPhaseBudgetShares(kv: KVNamespace): Promise<Record<DiscoveryPhase, number>> {
  try {
    const raw = await kv.get(PHASE_BUDGET_SHARE_KV_KEY);
    if (!raw) return DEFAULT_PHASE_BUDGET_SHARE;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidShareSet(parsed)) {
      logger.warn("groq_phase_shares_invalid_stored_value", { raw });
      return DEFAULT_PHASE_BUDGET_SHARE;
    }
    return parsed;
  } catch (err) {
    logger.error("groq_phase_shares_read_failed", { error: String(err) });
    return DEFAULT_PHASE_BUDGET_SHARE;
  }
}

/**
 * Persists a new projects/tools/tasks split (fractions 0-1, summing to 1
 * within `SHARE_SUM_TOLERANCE`) — called from the admin "custom budget"
 * setter (`PUT /admin/ai/budget`). Takes effect on the very next call to
 * `reserveGroqRequest` / `getGroqQuotaSnapshot`; doesn't touch or reset
 * any of today's already-spent counters, so changing the split partway
 * through the day re-slices whatever's LEFT, not what's already been
 * used.
 */
export async function setPhaseBudgetShares(
  kv: KVNamespace,
  shares: Record<DiscoveryPhase, number>,
): Promise<Record<DiscoveryPhase, number>> {
  if (!isValidShareSet(shares)) throw new InvalidPhaseBudgetSharesError();
  await kv.put(PHASE_BUDGET_SHARE_KV_KEY, JSON.stringify(shares));
  logger.info("groq_phase_shares_updated", { shares });
  return shares;
}

function phaseLimit(totalLimit: number, phase: DiscoveryPhase, shares: Record<DiscoveryPhase, number>): number {
  return Math.max(1, Math.floor(totalLimit * shares[phase]));
}

export type GroqQuotaReason = "rpm" | "rpd" | "tpm" | "tpd" | "rpd_phase" | "tpd_phase";

/**
 * Thrown by `reserveGroqRequest` when there is no budget left to wait
 * out. `reason: "rpd"` / `"tpd"` means today's ACCOUNT-WIDE daily budget
 * (requests or tokens) is fully spent — the caller must stop entirely,
 * not retry, since nothing frees up until UTC midnight. `reason:
 * "rpd_phase"` / `"tpd_phase"` means the account still has budget left
 * overall, but THIS phase (`phase` below — projects/tools/tasks) has
 * used up its own allocated share for today (see PHASE_BUDGET_SHARE) —
 * the caller stops that phase specifically; the other phases are
 * unaffected and still have their own budget. `reason: "rpm"` / `"tpm"`
 * means the per-minute window is exhausted even after this function's
 * own internal wait — rare in practice, since `reserveGroqRequest`
 * already waits out short per-minute windows itself before throwing for
 * either of these two reasons.
 */
export class GroqQuotaExceededError extends Error {
  reason: GroqQuotaReason;
  retryAfterMs: number;
  phase?: DiscoveryPhase;

  constructor(reason: GroqQuotaReason, retryAfterMs: number, phase?: DiscoveryPhase) {
    const label = reason === "rpd" || reason === "tpd" ? "daily" : reason === "rpd_phase" || reason === "tpd_phase" ? `daily ${phase}` : "per-minute";
    const unit = reason === "rpm" || reason === "rpd" || reason === "rpd_phase" ? "request" : "token";
    super(`Groq ${label} ${unit} quota exhausted`);
    this.name = "GroqQuotaExceededError";
    this.reason = reason;
    this.phase = phase;
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

function phaseRpdKey(phase: DiscoveryPhase): string {
  return `groq:rpd:phase:${phase}:${todayKey()}`;
}

function phaseTpdKey(phase: DiscoveryPhase): string {
  return `groq:tpd:phase:${phase}:${todayKey()}`;
}

/**
 * Reserves budget for exactly one outbound Groq request estimated to cost
 * `estimatedTokens` tokens, on behalf of the given discovery `phase`
 * (projects/tools/tasks). Call this immediately before every real fetch
 * to the Groq API — never after.
 *
 * Checks budget on SIX dimensions, not four: the account-wide RPM/RPD/
 * TPM/TPD counters (unchanged from before phases existed — these are the
 * real Groq caps and always apply regardless of phase), PLUS this
 * phase's own RPD/TPD share (see PHASE_BUDGET_SHARE) — a phase can never
 * spend past its allocated quarter/half of the day even while the
 * account overall still has room, which is exactly what keeps a chatty
 * projects run from eating into tasks' budget or vice versa.
 *
 * Resolves once budget exists on every dimension, waiting out a short
 * per-minute window itself (up to `maxWaitAttempts` times) when only RPM
 * or TPM is the blocker. Throws `GroqQuotaExceededError` immediately,
 * with no wait, the moment any daily counter (account-wide or
 * phase-specific) is gone for the day — the caller must stop (that
 * phase, or the whole run for an account-wide exhaustion) rather than
 * retry.
 */
export async function reserveGroqRequest(
  kv: KVNamespace,
  estimatedTokens: number,
  phase: DiscoveryPhase,
  maxWaitAttempts = 2,
): Promise<void> {
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

  const shares = await getPhaseBudgetShares(kv);
  const rpdKey = `groq:rpd:${todayKey()}`;
  const tpdKey = `groq:tpd:${todayKey()}`;
  const phaseRpd = phaseRpdKey(phase);
  const phaseTpd = phaseTpdKey(phase);
  const phaseRpdLimit = phaseLimit(GROQ_RPD_LIMIT, phase, shares);
  const phaseTpdLimit = phaseLimit(GROQ_TPD_LIMIT, phase, shares);

  for (let attempt = 0; attempt <= maxWaitAttempts; attempt++) {
    const usedToday = await readCounter(kv, rpdKey);
    if (usedToday >= GROQ_RPD_LIMIT) {
      throw new GroqQuotaExceededError("rpd", msUntilNextUtcMidnight());
    }

    const tokensToday = await readCounter(kv, tpdKey);
    if (tokensToday + estimatedTokens > GROQ_TPD_LIMIT) {
      throw new GroqQuotaExceededError("tpd", msUntilNextUtcMidnight());
    }

    // Phase-scoped checks — separate from, and in addition to, the
    // account-wide ones above. This is the actual 25/25/50 split: even
    // though the account still has requests/tokens left today, THIS
    // phase stops once it's used its own share.
    const phaseUsedToday = await readCounter(kv, phaseRpd);
    if (phaseUsedToday >= phaseRpdLimit) {
      throw new GroqQuotaExceededError("rpd_phase", msUntilNextUtcMidnight(), phase);
    }

    const phaseTokensToday = await readCounter(kv, phaseTpd);
    if (phaseTokensToday + estimatedTokens > phaseTpdLimit) {
      throw new GroqQuotaExceededError("tpd_phase", msUntilNextUtcMidnight(), phase);
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
      logger.warn("groq_quota_minute_wait", { waitMs, attempt, rpmBlocked, tpmBlocked, phase });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    await incrementCounter(kv, rpdKey, 1, msUntilNextUtcMidnight() / 1000);
    await incrementCounter(kv, tpdKey, estimatedTokens, msUntilNextUtcMidnight() / 1000);
    await incrementCounter(kv, phaseRpd, 1, msUntilNextUtcMidnight() / 1000);
    await incrementCounter(kv, phaseTpd, estimatedTokens, msUntilNextUtcMidnight() / 1000);
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
  const shares = await getPhaseBudgetShares(kv);

  const phases = await Promise.all(
    PHASE_SPEND_ORDER.map(async (phase) => {
      const rpdLimit = phaseLimit(GROQ_RPD_LIMIT, phase, shares);
      const tpdLimit = phaseLimit(GROQ_TPD_LIMIT, phase, shares);
      const rpdUsed = await readCounter(kv, phaseRpdKey(phase));
      const tpdUsed = await readCounter(kv, phaseTpdKey(phase));
      return {
        phase,
        sharePct: Math.round(shares[phase] * 100),
        limitPerDay: rpdLimit,
        usedToday: rpdUsed,
        remainingToday: Math.max(rpdLimit - rpdUsed, 0),
        tokenLimitPerDay: tpdLimit,
        tokensUsedToday: tpdUsed,
        tokensRemainingToday: Math.max(tpdLimit - tpdUsed, 0),
      };
    }),
  );

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
    phases,
  };
}

/**
 * True once a phase can no longer make any more Groq calls today — its
 * own daily request share OR its own daily token share (whichever binds
 * first) has hit zero. Mirrors the "exhausted" definition the admin quota
 * panel already uses (`budgetColors` in `groq-quota-panel.tsx`): either
 * dimension reaching zero means `reserveGroqRequest` will throw
 * `GroqQuotaExceededError` for this phase on its very next call, so the
 * phase is effectively done for the day even if the other dimension has
 * room left.
 */
export function isPhaseBudgetExhausted(phase: { remainingToday: number; tokensRemainingToday: number }): boolean {
  return phase.remainingToday <= 0 || phase.tokensRemainingToday <= 0;
}