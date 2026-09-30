// devtunnel-backend/src/lib/ai/summaries.ts
import { z } from "zod";
import type { Env } from "../../types";
import type { ValidatedEnv } from "../../config/env";
import { getSupabase } from "../supabase";
import { logger } from "../logger";
import { runJson } from "./json";
import {
  SUMMARY_MAX_OUTPUT_TOKENS,
  SUMMARY_PROMPT_VERSION,
  buildSummaryMessages,
  sanitizeSummary,
  summarySchema,
  type AiSummary,
  type SummaryPromptInput,
} from "./prompts/summary";
import { loadSummarySource, type SummaryKind } from "./summarySource";

/**
 * Generate once, store, reuse (Part 1 rule 3) — the heart of Part 4.
 *
 * ---------------------------------------------------------------------
 * One request, step by step
 * ---------------------------------------------------------------------
 *   1. Read the stored row for (kind, subject_key).
 *   2. If it was CHECKED against its source in the last 24 h → return it.
 *      No GitHub call, no README read, no model call. This is the path
 *      almost every visit takes.
 *   3. Otherwise load the source text and hash what the model would see.
 *      - Same hash → the summary is still right. Stamp `checked_at` (off
 *        the request path) and return it.
 *      - Different hash but the summary was generated less than 3 days ago →
 *        return the old one anyway (and stamp `checked_at`). A README that
 *        is edited daily must not burn a model call daily.
 *      - Different hash AND older than 3 days, or no row yet → generate.
 *   4. Generate: ONE model call (job "summary": Gemini Flash-Lite → Mistral →
 *      OpenRouter, then the global last-resort list), zod-validate, sanitise,
 *      upsert. If the model's answer is unusable nothing is stored.
 *
 * ---------------------------------------------------------------------
 * Free-plan notes (Part 1 rule 1)
 * ---------------------------------------------------------------------
 *  - No Workers KV writes: durable data is in Supabase (`ai_summaries`,
 *    sql/039). KV is only READ, by the GitHub source loader.
 *  - Duplicate work: an in-memory in-flight map makes concurrent requests
 *    for the same page in ONE isolate share one generation. Across isolates
 *    two visitors can still both generate the very first summary; the
 *    `unique (kind, subject_key)` upsert keeps the table consistent (last
 *    write wins) and the cost is at most one wasted call, once per page.
 *    There is deliberately no KV lock — a lock is a KV write.
 *  - If the table can't be READ (migration not run, Supabase down) this
 *    throws instead of falling through to the model: generating something
 *    that can't be stored would spend a free-tier call on every page view.
 */

/** How long a stored summary is trusted without re-comparing it with its source. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** A changed source only triggers regeneration once the summary is at least this old. */
const MIN_REGEN_AGE_MS = 3 * 24 * 60 * 60 * 1000;

/** Per-call model budget: a visitor is watching a skeleton. */
const SUMMARY_TIMEOUT_MS = 20_000;

/** Below this there is nothing real to summarise; the model would only invent something. */
const MIN_README_CHARS = 80;
const MIN_DESCRIPTION_CHARS = 20;

export interface SummaryResult {
  summary: AiSummary;
  provider: string;
  model: string;
  /** ISO time the summary text was generated. */
  generatedAt: string;
  /** True when no model was called for this request. */
  cached: boolean;
}

/** The source has too little text (no README, no real description) to summarise honestly. */
export class SummaryNotEnoughContentError extends Error {
  constructor() {
    super("Not enough content to summarise");
    this.name = "SummaryNotEnoughContentError";
  }
}

/** The model answered, but nothing usable survived validation. */
export class SummaryUnusableError extends Error {
  constructor() {
    super("The AI's summary couldn't be used");
    this.name = "SummaryUnusableError";
  }
}

/** The per-user generation limit said no. */
export class SummaryRateLimitedError extends Error {
  constructor() {
    super("Summary generation rate limited");
    this.name = "SummaryRateLimitedError";
  }
}

const storedSummarySchema = z.object({
  tldr: z.string(),
  whatItDoes: z.string(),
  techStack: z.array(z.string()),
  goodFor: z.array(z.string()),
  setupDifficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).nullable(),
});

interface StoredRow {
  content_hash: string;
  summary: unknown;
  provider: string;
  model: string;
  updated_at: string;
  checked_at: string;
}

const STORED_COLUMNS = "content_hash, summary, provider, model, updated_at, checked_at";

/** Concurrent requests for one page, in this isolate, share a single unit of work. */
const inFlight = new Map<string, Promise<SummaryResult>>();

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function hasEnoughContent(input: SummaryPromptInput): boolean {
  return (input.readme?.trim().length ?? 0) >= MIN_README_CHARS || (input.description?.trim().length ?? 0) >= MIN_DESCRIPTION_CHARS;
}

function ageMs(iso: string): number {
  const time = new Date(iso).getTime();
  return Number.isFinite(time) ? Date.now() - time : Number.POSITIVE_INFINITY;
}

/** A stored row as a result, or `null` when its JSON no longer matches the current shape (it is then regenerated). */
function rowToResult(row: StoredRow): SummaryResult | null {
  const parsed = storedSummarySchema.safeParse(row.summary);
  if (!parsed.success) return null;
  return { summary: parsed.data, provider: row.provider, model: row.model, generatedAt: row.updated_at, cached: true };
}

export interface GetSummaryParams {
  rawEnv: Env;
  env: ValidatedEnv;
  ctx: ExecutionContext;
  kind: SummaryKind;
  /** Already validated + canonicalised by `normalizeSubjectKey`. */
  subjectKey: string;
  /** Called only right before a model call; return false when the caller is over its generation limit. */
  allowGeneration: () => Promise<boolean>;
}

export async function getOrCreateSummary(params: GetSummaryParams): Promise<SummaryResult> {
  const { env, kind, subjectKey } = params;
  const supabase = getSupabase(env);

  const { data, error } = await supabase
    .from("ai_summaries")
    .select(STORED_COLUMNS)
    .eq("kind", kind)
    .eq("subject_key", subjectKey)
    .maybeSingle<StoredRow>();
  if (error) throw new Error(`Failed to read stored AI summary: ${error.message}`);

  const stored = data ?? null;
  const storedResult = stored ? rowToResult(stored) : null;

  // Step 2: recently verified — the common case, and the only one that is free.
  if (stored && storedResult && ageMs(stored.checked_at) < CHECK_INTERVAL_MS) return storedResult;

  const flightKey = `${kind}:${subjectKey}`;
  const running = inFlight.get(flightKey);
  if (running) return running;

  const work = refreshSummary(params, stored, storedResult).finally(() => {
    inFlight.delete(flightKey);
  });
  inFlight.set(flightKey, work);
  return work;
}

async function stampChecked(env: ValidatedEnv, kind: SummaryKind, subjectKey: string): Promise<void> {
  try {
    const { error } = await getSupabase(env)
      .from("ai_summaries")
      .update({ checked_at: new Date().toISOString() })
      .eq("kind", kind)
      .eq("subject_key", subjectKey);
    if (error) throw error;
  } catch (err) {
    logger.warn("ai_summary_stamp_checked_failed", { kind, error: err instanceof Error ? err.message : String(err) });
  }
}

async function refreshSummary(
  params: GetSummaryParams,
  stored: StoredRow | null,
  storedResult: SummaryResult | null,
): Promise<SummaryResult> {
  const { rawEnv, env, ctx, kind, subjectKey, allowGeneration } = params;

  const source = await loadSummarySource(rawEnv, env, kind, subjectKey);

  if (!hasEnoughContent(source)) {
    // The README was removed since we last looked: keep what we have rather than erroring.
    if (storedResult) return storedResult;
    throw new SummaryNotEnoughContentError();
  }

  const messages = buildSummaryMessages(source);
  const promptText = messages[1]?.content ?? "";
  const contentHash = await sha256Hex(`${SUMMARY_PROMPT_VERSION}\n${promptText}`);

  if (stored && storedResult) {
    const unchanged = stored.content_hash === contentHash;
    const tooYoungToRegenerate = ageMs(stored.updated_at) < MIN_REGEN_AGE_MS;
    if (unchanged || tooYoungToRegenerate) {
      ctx.waitUntil(stampChecked(env, kind, subjectKey));
      return storedResult;
    }
  }

  if (!(await allowGeneration())) throw new SummaryRateLimitedError();

  const answer = await runJson(env, "summary", messages, summarySchema, {
    ctx,
    maxTokens: SUMMARY_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    timeoutMs: SUMMARY_TIMEOUT_MS,
  });
  const summary = sanitizeSummary(answer.data, promptText);
  if (!summary) {
    logger.warn("ai_summary_unusable_after_sanitising", { kind, provider: answer.provider });
    throw new SummaryUnusableError();
  }

  const nowIso = new Date().toISOString();
  const { error } = await getSupabase(env)
    .from("ai_summaries")
    .upsert(
      {
        kind,
        subject_key: subjectKey,
        content_hash: contentHash,
        summary,
        provider: answer.provider,
        model: answer.model,
        updated_at: nowIso,
        checked_at: nowIso,
      },
      { onConflict: "kind,subject_key" },
    );
  if (error) {
    // The visitor still gets their summary; the next visit will regenerate.
    logger.error("ai_summary_store_failed", { kind, error: error.message });
  }

  logger.info("ai_summary_generated", {
    kind,
    provider: answer.provider,
    model: answer.model,
    repaired: answer.repaired,
    requestSizeEstimate: promptText.length,
  });

  return { summary, provider: answer.provider, model: answer.model, generatedAt: nowIso, cached: false };
}
