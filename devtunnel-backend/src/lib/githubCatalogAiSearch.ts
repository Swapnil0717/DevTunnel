// devtunnel-backend/src/lib/githubCatalogAiSearch.ts
import type { Env, Variables } from "../types";
import type { Context } from "hono";
import { errorResponse } from "./response";
import { logger } from "./logger";
import { getCachedSWR } from "./cache";
import {
  CATALOG_CACHE_HARD_TTL_SECONDS,
  type CatalogRouteConfig,
  type CatalogSummary,
} from "./githubCatalog";
import { rankByPromptKeywords, rankByTerms, type ScorableItem } from "./ai/scoring";
import {
  AiDisabledError,
  beginAiSearch,
  keywordFallbackInterpretation,
  resolveSearchInterpretation,
  type AiSearchFallbackReason,
  type AiSearchInterpretation,
  type AiSearchResponse as SharedAiSearchResponse,
  type ResolvedInterpretation,
} from "./ai/searchInterpretation";

// Part 3 moved the prompt/cache/sanitising plumbing to ./ai/searchInterpretation
// (shared with the DevTunnel lists). Re-exported so existing importers keep working.
export {
  AI_SEARCH_MAX_PROMPT_CHARS,
  keywordFallbackInterpretation,
  normalizePrompt,
  sanitizeInterpretation,
  type AiSearchFallbackReason,
  type AiSearchInterpretation,
} from "./ai/searchInterpretation";

/**
 * AI search for the two GitHub-wide catalogs — `POST /github-projects/ai-search`
 * and `POST /github-open-source-tools/ai-search` (Part 2 of the AI build plan).
 * Written once here and mounted by both routes, exactly like
 * `handleCatalogListRequest` in ./githubCatalog.ts.
 *
 * (Part 3 added the same feature for the DevTunnel-curated lists in
 * ./devtunnelAiSearch.ts; the parts both need — the sign-in / rate-limit
 * gate, the interpretation cache, the single model call and the sanitiser —
 * live in ./ai/searchInterpretation.ts, and the ranking maths in
 * ./ai/scoring.ts. This file keeps only what is specific to the GitHub
 * catalogs: reading their cached KV slots and mapping rows to scorable form.)
 *
 * ---------------------------------------------------------------------
 * Shape of one request
 * ---------------------------------------------------------------------
 *   1. Signed-in only (route-level `requireAuth`) + a per-user rate limit.
 *   2. Normalise the prompt (control chars out, whitespace collapsed).
 *   3. Look the prompt up in the Cloudflare Cache API. A hit skips the model.
 *   4. On a miss: ONE model call (the "search" job) turns the prompt into
 *      `{ keywords, techStack, languages, intent }`. The answer is
 *      zod-validated and then sanitised item by item.
 *   5. OUR scoring ranks rows of the catalog we already hold. The model never
 *      sees the catalog and never names a repository, so it cannot invent one
 *      (Part 1 rule 6).
 *   6. If the model is unavailable or its answer is unusable, the same
 *      scoring runs on the raw prompt's words and the response says
 *      `aiUsed: false` — an honest fallback, never a faked AI result.
 *
 * ---------------------------------------------------------------------
 * Why this design suits the Workers FREE plan (Part 1 rule 1)
 * ---------------------------------------------------------------------
 *  - NO new KV writes. The catalog slots are only READ (`getCachedSWR` is a
 *    KV `get`). The interpretation cache lives in the Cache API, which is
 *    free and not counted against KV's 1,000 writes/day.
 *  - Ranking is re-run per request against the current catalog, so a cached
 *    interpretation never serves stale repositories.
 *  - This path NEVER starts a GitHub scan. If the base catalog slot is
 *    empty it answers 503 `catalog_warming` (the scheduled warmers own scans).
 */

/** Rows returned per search (Part 2 spec: "top ~60"). */
export const AI_SEARCH_RESULT_LIMIT = 60;

/** Below this score a row is noise (a single passing mention in a description scores 1). */
const AI_MIN_SCORE = 2;

/** Kept as an alias so `AiSearchResponse` still means "a GitHub catalog response" for existing importers. */
export type AiSearchResponse = SharedAiSearchResponse<CatalogSummary>;

export interface AiSearchRouteOptions {
  /**
   * Named filters of the route's `CatalogRouteConfig.filters` whose cached
   * rows are searched IN ADDITION to the base catalog, when (and only when)
   * they are already cached. They cover repositories the base catalog
   * doesn't hold (e.g. the tools page's "alternative to paid software"
   * population, or the low-star buckets on /github-projects).
   *
   * Each extra slot is one more KV read plus one more JSON.parse of a
   * catalog-sized value. On the Free plan's ~10 ms CPU budget that parse is
   * the expensive part, so keep this list SHORT (0–1 entries); an empty list
   * is always safe.
   */
  extraFilterKeys?: string[];
}

// ---------------------------------------------------------------------------
// Catalog rows (read-only KV) and scoring
// ---------------------------------------------------------------------------

/**
 * Reads the cached catalog rows to search: the base slot, plus any
 * `extraFilterKeys` slots that happen to be cached. Returns `null` when the
 * BASE slot is empty (catalog not built yet). KV READS only.
 */
async function loadCatalogRows(
  env: Env,
  config: CatalogRouteConfig,
  extraFilterKeys: string[],
): Promise<CatalogSummary[] | null> {
  // Soft TTL is irrelevant here (fresh and stale are both fine to search),
  // so the hard TTL is passed only to satisfy the signature.
  const extraSlots = extraFilterKeys
    .map((key) => config.filters?.[key]?.cacheKey)
    .filter((slot): slot is string => typeof slot === "string");

  const [base, ...extras] = await Promise.all([
    getCachedSWR<CatalogSummary[]>(env, config.cacheKey, CATALOG_CACHE_HARD_TTL_SECONDS),
    ...extraSlots.map((slot) => getCachedSWR<CatalogSummary[]>(env, slot, CATALOG_CACHE_HARD_TTL_SECONDS)),
  ]);
  if (base.status === "miss") return null;

  const byId = new Map<string, CatalogSummary>();
  for (const row of base.value) byId.set(row.id, row);
  for (const extra of extras) {
    if (extra.status === "miss") continue;
    for (const row of extra.value) if (!byId.has(row.id)) byId.set(row.id, row);
  }
  return Array.from(byId.values());
}

function toScorable(row: CatalogSummary): ScorableItem {
  return {
    name: row.name,
    description: row.description,
    techStack: row.techStack,
    language: row.primaryLanguage,
  };
}

/**
 * Ranks catalog rows for an AI interpretation with the shared
 * `rankByTerms` (lib/ai/scoring.ts — name 5 / tags 3 / description 1,
 * +6 per requested tech-stack tag the row carries, +4 for a matching
 * language alongside some other signal). Ties break on stars so the more
 * established repository comes first.
 */
export function rankByInterpretation(
  rows: CatalogSummary[],
  interpretation: AiSearchInterpretation,
  limit = AI_SEARCH_RESULT_LIMIT,
): CatalogSummary[] {
  return rankByTerms(rows, interpretation, toScorable, {
    limit,
    minScore: AI_MIN_SCORE,
    tieBreak: (a, b) => b.stars - a.stars,
  });
}

/** The non-AI path: plain keyword scoring over the prompt's own words. */
export function rankByKeywords(rows: CatalogSummary[], prompt: string, limit = AI_SEARCH_RESULT_LIMIT): CatalogSummary[] {
  return rankByPromptKeywords(rows, prompt, toScorable, { limit, minScore: 1 });
}

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

type AiSearchContext = Context<{ Bindings: Env; Variables: Variables }>;

/**
 * Shared handler behind both `…/ai-search` routes. The route must already
 * have run `requireAuth`; `beginAiSearch` re-checks the user anyway (same
 * belt-and-braces the other authenticated handlers use).
 *
 * Status codes: 400 bad body · 401 no session · 429 rate limited ·
 * 503 `ai_disabled` (AI_FEATURES_ENABLED=false) · 503 `catalog_warming`
 * (base catalog not cached yet) · 200 otherwise — including the keyword
 * fallback, which is a normal, honest answer (`aiUsed: false`).
 */
export async function handleCatalogAiSearchRequest(
  c: AiSearchContext,
  config: CatalogRouteConfig,
  options: AiSearchRouteOptions = {},
) {
  const begun = await beginAiSearch(c, `${config.name}-ai-search`);
  if (!begun.ok) return begun.response;
  const { env, prompt } = begun;

  try {
    const rows = await loadCatalogRows(c.env, config, options.extraFilterKeys ?? []);
    if (rows === null) {
      c.header("Retry-After", "15");
      return errorResponse(c, 503, "catalog_warming", "This catalog is still being built. Try again shortly.");
    }

    // 1) Interpretation: cache first, then ONE model call.
    let resolved: ResolvedInterpretation;
    try {
      resolved = await resolveSearchInterpretation(c, env, prompt);
    } catch (err) {
      if (err instanceof AiDisabledError) {
        return errorResponse(c, 503, "ai_disabled", "AI search is turned off right now.");
      }
      throw err;
    }

    // 2) Rank: with the model's terms if we have them, otherwise the raw prompt's words.
    if (resolved.interpretation) {
      const results = rankByInterpretation(rows, resolved.interpretation);
      logger.info("ai_search_served", {
        catalog: config.name,
        aiUsed: true,
        cached: resolved.fromCache,
        resultCount: results.length,
        requestId: c.get("requestId"),
      });
      const body: AiSearchResponse = { results, interpretation: resolved.interpretation, aiUsed: true, scanned: rows.length };
      return c.json(body, 200);
    }

    const fallbackReason: AiSearchFallbackReason = resolved.fallbackReason ?? "unavailable";
    const results = rankByKeywords(rows, prompt);
    logger.warn("ai_search_fallback", {
      catalog: config.name,
      reason: fallbackReason,
      resultCount: results.length,
      requestId: c.get("requestId"),
    });
    const body: AiSearchResponse = {
      results,
      interpretation: keywordFallbackInterpretation(prompt),
      aiUsed: false,
      fallbackReason,
      scanned: rows.length,
    };
    return c.json(body, 200);
  } catch (err) {
    logger.error(`${config.name}_ai_search_failed`, {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't run this search right now");
  }
}
