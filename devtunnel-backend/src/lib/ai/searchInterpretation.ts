// devtunnel-backend/src/lib/ai/searchInterpretation.ts
import { z } from "zod";
import type { Context } from "hono";
import type { Env, Variables } from "../../types";
import { getEnv } from "../../config/env";
import { checkRateLimit } from "../rateLimit";
import { errorResponse } from "../response";
import { logger } from "../logger";
import { mapGithubTopicsToTechStack } from "../techTopics";
import {
  AiDisabledError,
  AiExhaustedError,
  AiNotConfiguredError,
  AiRequestError,
  aiFeaturesEnabled,
} from "./client";
import { AiJsonError, runJson } from "./json";
import { stripControlChars } from "./prompts/untrusted";
import {
  SEARCH_MAX_OUTPUT_TOKENS,
  buildSearchMessages,
  searchInterpretationSchema,
  type RawSearchInterpretation,
} from "./prompts/search";
import { detectTechStack, tokenizeQuery } from "./scoring";

/**
 * Everything the four AI search endpoints share — the two GitHub catalogs
 * (Part 2, lib/githubCatalogAiSearch.ts) and the two DevTunnel lists
 * (Part 3, lib/devtunnelAiSearch.ts). Extracted from the Part 2 file in
 * Part 3 so there is exactly ONE copy of:
 *
 *   - the request-body rules and the signed-in / AI-enabled / rate-limit gate
 *     (`beginAiSearch`);
 *   - turning a typed sentence into search terms: cache lookup, the single
 *     "search" model call, and sanitising the answer
 *     (`resolveSearchInterpretation`, `sanitizeInterpretation`);
 *   - the honest keyword fallback description (`keywordFallbackInterpretation`).
 *
 * Nothing here knows what is being searched — a catalog row, a DevTunnel
 * project or a DevTunnel tool. Each endpoint supplies its own rows and
 * ranks them with lib/ai/scoring.ts. The model never sees those rows and
 * never names an item, so it cannot invent one (Part 1 rule 6).
 *
 * ---------------------------------------------------------------------
 * Free-plan budget (Part 1 rule 1)
 * ---------------------------------------------------------------------
 * No KV writes anywhere in this file. The interpretation cache lives in the
 * Cloudflare Cache API, keyed by a SHA-256 of the normalised prompt — never
 * the user's raw text, never per-user data — so it is safe to share between
 * users AND between all four endpoints: a sentence someone searched on
 * /github-projects is already interpreted when someone else types it on
 * /projects. (`checkRateLimit` batches its own KV writes — one put per 5
 * calls — and is the only KV write on this path.)
 *
 * Cache API caveat: it only works on a custom domain route
 * (api.devtunnel.tech) — on a `*.workers.dev` URL, `put` silently does
 * nothing. That only costs an extra model call; it never breaks the feature.
 */

/** Longest prompt accepted (Part 2 spec). */
export const AI_SEARCH_MAX_PROMPT_CHARS = 300;

/** 8 AI searches a minute per user: enough to refine a query, far below what could drain the free model budgets. */
const AI_SEARCH_RATE_LIMIT_PER_MINUTE = 8;

/** How long a prompt's interpretation is reused. Six hours: the words a prompt means don't change; only the rows do, and ranking re-reads them every time. */
const INTERPRETATION_CACHE_SECONDS = 6 * 60 * 60;

/** Bump to invalidate every cached interpretation (e.g. after changing the search prompt or the sanitiser). */
const INTERPRETATION_CACHE_VERSION = "v1";

/** Per-call model budget: this sits in front of a user waiting on a spinner. */
const AI_SEARCH_TIMEOUT_MS = 15_000;

const MAX_KEYWORDS = 8;
const MAX_TECH_STACK = 6;
const MAX_LANGUAGES = 3;
const MAX_INTENT_CHARS = 160;

export interface AiSearchInterpretation {
  keywords: string[];
  techStack: string[];
  languages: string[];
  intent: string;
}

export type AiSearchFallbackReason = "unavailable" | "unusable_answer";

/**
 * Wire shape of every `POST …/ai-search` response. `Row` is the same item
 * shape the matching list endpoint returns, so the browser can render the
 * results with the cards it already has.
 */
export interface AiSearchResponse<Row> {
  results: Row[];
  interpretation: AiSearchInterpretation;
  /** `true` only when a model's answer (fresh or cached) actually drove the ranking. */
  aiUsed: boolean;
  /** Present only when `aiUsed` is false, so the UI can say why. */
  fallbackReason?: AiSearchFallbackReason;
  /** How many rows were ranked — lets the UI say "searched N …" honestly. */
  scanned: number;
}

// ---------------------------------------------------------------------------
// Request body
// ---------------------------------------------------------------------------

/** Control characters out, whitespace runs collapsed, trimmed. Case is preserved (lower-casing happens only for the cache key). */
export function normalizePrompt(value: string): string {
  return stripControlChars(value).replace(/\s+/g, " ").trim();
}

const requestBodySchema = z.object({
  prompt: z
    .string()
    .transform((value) => normalizePrompt(value))
    .pipe(
      z
        .string()
        .min(2, "Describe what you're looking for (at least 2 characters)")
        .max(AI_SEARCH_MAX_PROMPT_CHARS, `Keep it under ${AI_SEARCH_MAX_PROMPT_CHARS} characters`),
    ),
});

// ---------------------------------------------------------------------------
// Sanitising the model's answer (Part 1 rules 5 and 6)
// ---------------------------------------------------------------------------

const TERM_PATTERN = /^[a-z0-9+#.\- ]+$/;

/** Lower-cases, collapses spaces, trims edge punctuation; returns null if it isn't a plain search term. */
function cleanTerm(raw: unknown, maxLength: number): string | null {
  if (typeof raw !== "string") return null;
  const term = raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\-+#\s]+|[.\-\s]+$/g, "");
  if (term.length < 2 || term.length > maxLength) return null;
  if (!TERM_PATTERN.test(term)) return null;
  return term;
}

function pushUnique(target: string[], value: string, max: number) {
  if (target.length < max && !target.includes(value)) target.push(value);
}

/**
 * Turns the model's (schema-valid but still untrusted) answer into terms
 * safe to score with. Every item is judged on its own — one bad keyword is
 * dropped, the rest survive:
 *  - keywords: plain lowercase terms only; filler/stop words removed.
 *  - techStack: kept ONLY if it maps to a canonical name via
 *    `mapGithubTopicsToTechStack` (the same list the catalog's tags come
 *    from); a technology we don't recognise is demoted to a keyword instead
 *    of being trusted as a tag.
 *  - languages: short plain names.
 *  - intent: plain text — no angle brackets, no URLs, capped in length.
 * Returns null when nothing usable is left, which the caller treats as an
 * unusable answer and falls back to keyword search.
 */
export function sanitizeInterpretation(raw: RawSearchInterpretation): AiSearchInterpretation | null {
  const keywords: string[] = [];
  const techStack: string[] = [];
  const languages: string[] = [];

  for (const item of raw.techStack) {
    const term = cleanTerm(item, 30);
    if (!term) continue;
    const canonical =
      mapGithubTopicsToTechStack([term.replace(/ /g, "-")], null)[0] ?? mapGithubTopicsToTechStack([term], null)[0];
    if (canonical) pushUnique(techStack, canonical, MAX_TECH_STACK);
    else if (tokenizeQuery(term).length > 0) pushUnique(keywords, term, MAX_KEYWORDS);
  }

  for (const item of raw.languages) {
    const term = cleanTerm(item, 20);
    if (term) pushUnique(languages, term, MAX_LANGUAGES);
  }

  for (const item of raw.keywords) {
    const term = cleanTerm(item, 30);
    if (!term) continue;
    // A lone stop word ("tool", "app") or a 1-char token carries no signal.
    if (!term.includes(" ") && tokenizeQuery(term).length === 0) continue;
    pushUnique(keywords, term, MAX_KEYWORDS);
  }

  if (keywords.length === 0 && techStack.length === 0 && languages.length === 0) return null;

  const intent = stripControlChars(raw.intent)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[<>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_INTENT_CHARS);

  return { keywords, techStack, languages, intent };
}

/** What the response reports when the model wasn't used: the raw prompt's own words, nothing invented. */
export function keywordFallbackInterpretation(prompt: string): AiSearchInterpretation {
  const terms = tokenizeQuery(prompt);
  return { keywords: terms, techStack: detectTechStack(terms), languages: [], intent: "" };
}

// ---------------------------------------------------------------------------
// Interpretation cache (Cloudflare Cache API — never KV)
// ---------------------------------------------------------------------------

const storedInterpretationSchema = z.object({
  keywords: z.array(z.string()).max(MAX_KEYWORDS),
  techStack: z.array(z.string()).max(MAX_TECH_STACK),
  languages: z.array(z.string()).max(MAX_LANGUAGES),
  intent: z.string().max(MAX_INTENT_CHARS),
});

function getCacheStorage(): Cache | null {
  try {
    const storage = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
    return storage?.default ?? null;
  } catch {
    return null;
  }
}

async function interpretationCacheRequest(prompt: string): Promise<Request> {
  // Hash of the lower-cased prompt: "React todo" and "react  todo" share one entry,
  // and the user's text never appears in a URL or a log.
  const bytes = new TextEncoder().encode(prompt.toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  // Synthetic, internal-only URL: the Cache API just needs a well-formed GET key.
  return new Request(`https://ai-cache.devtunnel.internal/search/${INTERPRETATION_CACHE_VERSION}/${hex}`);
}

async function readCachedInterpretation(key: Request): Promise<AiSearchInterpretation | null> {
  const cache = getCacheStorage();
  if (!cache) return null;
  try {
    const hit = await cache.match(key);
    if (!hit) return null;
    const parsed = storedInterpretationSchema.safeParse(await hit.json());
    return parsed.success ? parsed.data : null;
  } catch (err) {
    logger.warn("ai_search_cache_read_failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function writeCachedInterpretation(key: Request, interpretation: AiSearchInterpretation): Promise<void> {
  const cache = getCacheStorage();
  if (!cache) return;
  try {
    await cache.put(
      key,
      new Response(JSON.stringify(interpretation), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${INTERPRETATION_CACHE_SECONDS}`,
        },
      }),
    );
  } catch (err) {
    // Best-effort: a failed cache write must never fail a search that already has its answer.
    logger.warn("ai_search_cache_write_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

// ---------------------------------------------------------------------------
// The shared front half of every AI search handler
// ---------------------------------------------------------------------------

export type AiSearchContext = Context<{ Bindings: Env; Variables: Variables }>;
export type ParsedEnv = ReturnType<typeof getEnv>;

export type BeginAiSearchResult =
  | { ok: true; env: ParsedEnv; prompt: string; user: NonNullable<Variables["user"]> }
  | { ok: false; response: Response };

/**
 * The gate every AI search endpoint runs first, in this order:
 *   401 no session (belt-and-braces: routes already run `requireAuth`) ·
 *   503 `ai_disabled` (AI_FEATURES_ENABLED=false) ·
 *   429 per-user rate limit (`bucket` — one per endpoint) ·
 *   400 bad body.
 * On success returns the parsed env, the normalised prompt and the signed-in user.
 */
export async function beginAiSearch(c: AiSearchContext, bucket: string): Promise<BeginAiSearchResult> {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) return { ok: false, response: errorResponse(c, 401, "unauthenticated", "Sign-in required") };

  if (!aiFeaturesEnabled(env)) {
    return { ok: false, response: errorResponse(c, 503, "ai_disabled", "AI search is turned off right now.") };
  }

  const withinLimit = await checkRateLimit(c, {
    bucket,
    limit: AI_SEARCH_RATE_LIMIT_PER_MINUTE,
    windowSeconds: 60,
    identity: `user:${user.id}`,
  });
  if (!withinLimit) {
    return { ok: false, response: errorResponse(c, 429, "rate_limited", "Too many AI searches. Try again in a minute.") };
  }

  const rawBody: unknown = await c.req.json().catch(() => null);
  const parsedBody = requestBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return {
      ok: false,
      response: errorResponse(c, 400, "invalid_body", parsedBody.error.issues[0]?.message ?? "Invalid request"),
    };
  }

  return { ok: true, env, prompt: parsedBody.data.prompt, user };
}

export interface ResolvedInterpretation {
  /** `null` means "rank with the raw prompt's words instead" (see `fallbackReason`). */
  interpretation: AiSearchInterpretation | null;
  fromCache: boolean;
  /** Set exactly when `interpretation` is null. */
  fallbackReason: AiSearchFallbackReason | null;
}

/**
 * Prompt → search terms: the interpretation cache first, then ONE model
 * call (the "search" job — a small fast Groq model, then Cerebras, then
 * Workers AI; Gemini/Mistral are excluded from this job in ai/chain.ts
 * because the prompt is user-typed text). The answer is zod-validated and
 * then sanitised item by item; a fresh good answer is written to the cache
 * off the request path via `waitUntil`.
 *
 * Never throws for "the model let us down": not configured / out of quota /
 * a rejected request / unusable JSON all come back as `interpretation: null`
 * plus a `fallbackReason`. The one exception is `AiDisabledError`, which is
 * rethrown so the caller can answer 503 `ai_disabled`; unknown errors are
 * rethrown too (they are bugs, not fallbacks).
 */
export async function resolveSearchInterpretation(
  c: AiSearchContext,
  env: ParsedEnv,
  prompt: string,
): Promise<ResolvedInterpretation> {
  const cacheRequest = await interpretationCacheRequest(prompt);
  const cached = await readCachedInterpretation(cacheRequest);
  if (cached) return { interpretation: cached, fromCache: true, fallbackReason: null };

  try {
    const answer = await runJson(env, "search", buildSearchMessages(prompt), searchInterpretationSchema, {
      ctx: c.executionCtx,
      maxTokens: SEARCH_MAX_OUTPUT_TOKENS,
      temperature: 0.1,
      timeoutMs: AI_SEARCH_TIMEOUT_MS,
    });
    const interpretation = sanitizeInterpretation(answer.data);
    if (!interpretation) return { interpretation: null, fromCache: false, fallbackReason: "unusable_answer" };
    c.executionCtx.waitUntil(writeCachedInterpretation(cacheRequest, interpretation));
    return { interpretation, fromCache: false, fallbackReason: null };
  } catch (err) {
    if (err instanceof AiDisabledError) throw err;
    if (err instanceof AiJsonError) return { interpretation: null, fromCache: false, fallbackReason: "unusable_answer" };
    if (err instanceof AiNotConfiguredError || err instanceof AiExhaustedError || err instanceof AiRequestError) {
      // Not configured / out of quota / a rejected request (already logged by the client).
      return { interpretation: null, fromCache: false, fallbackReason: "unavailable" };
    }
    throw err;
  }
}

export { AiDisabledError };
