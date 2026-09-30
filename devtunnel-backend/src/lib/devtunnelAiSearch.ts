// devtunnel-backend/src/lib/devtunnelAiSearch.ts
import { z } from "zod";
import type { Env, Variables } from "../types";
import type { Context } from "hono";
import { errorResponse } from "./response";
import { logger } from "./logger";
import { getSupabase } from "./supabase";
import { getCachedList } from "./ai/listCache";
import { rankByPromptKeywords, rankByTerms, type ScorableItem } from "./ai/scoring";
import {
  AiDisabledError,
  beginAiSearch,
  keywordFallbackInterpretation,
  resolveSearchInterpretation,
  type AiSearchResponse,
  type ParsedEnv,
  type ResolvedInterpretation,
} from "./ai/searchInterpretation";
import { toOnboardingTechStackOrNull } from "../db/adminProjects";
import {
  contributorMatchProfileFor,
  listSearchableProjects,
  searchableProjectTags,
  toProjectSummary,
  type ProjectSummary,
  type SearchableProject,
} from "../db/projects";
import { listAvailableOpenSourceTools, type OpenSourceToolSummary } from "../db/openSourceTools";

/**
 * AI search for DevTunnel's OWN curated lists (Part 3 of the AI build plan):
 *
 *   POST /projects/ai-search          → "Projects on Devtunnel"      (/projects)
 *   POST /opensource-tools/ai-search  → "Open Source Tools on Devtunnel" (/opensource-tools)
 *
 * The sibling of lib/githubCatalogAiSearch.ts (Part 2), and it deliberately
 * behaves the same way so the two page families feel identical:
 *
 *   1. Signed-in + AI-enabled + per-user rate limit + body checks — the
 *      shared `beginAiSearch` gate.
 *   2. Load the searchable rows (below).
 *   3. Prompt → search terms: interpretation cache, then ONE model call —
 *      the shared `resolveSearchInterpretation`. The very same "search" job,
 *      provider chain, prompt and schema as Part 2. Interpretations are
 *      cached by prompt only, so a sentence already searched on any of the
 *      four AI search pages costs no model call on the others.
 *   4. OUR scoring (lib/ai/scoring.ts) ranks the rows. The model never sees
 *      them and never names an item, so it can't invent a project or tool
 *      (Part 1 rule 6).
 *   5. Model unavailable / unusable → the same scoring over the prompt's own
 *      words, reported as `aiUsed: false`. Never a faked AI result.
 *
 * ---------------------------------------------------------------------
 * "Onboarded items only"
 * ---------------------------------------------------------------------
 * The searchable population is exactly what the list endpoints show:
 * `listSearchableProjects` is the query `GET /projects/available` itself
 * runs (ACTIVE, not a tool's shadow project, not soft-deleted) and
 * `listAvailableOpenSourceTools` is the query behind
 * `GET /opensource-tools/available` (a row existing in
 * `devtunnel.opensource_tools` means it is published). Results are mapped
 * to those endpoints' own row shapes, so the browser renders them with the
 * cards it already has.
 *
 * ---------------------------------------------------------------------
 * Free-plan budget (Part 1 rule 1)
 * ---------------------------------------------------------------------
 * No KV writes and no KV reads here. The row list is cached in the Cache
 * API for `LIST_CACHE_SECONDS` (lib/ai/listCache.ts) so a burst of searches
 * costs one Supabase read, not one per search. Only viewer-independent data
 * is cached: a contributor's project `matchPercent`/`matchRole` is computed
 * AFTER ranking, for the top results only, from the signed-in viewer's
 * profile (just like `GET /projects/available`).
 *
 * The rows are small (a few hundred at most — both lists are capped at 500
 * in db/) and ranking is a single pass of string `includes`, well inside
 * the Free plan's CPU budget.
 */

/** Rows returned per search — same as the GitHub catalogs (Part 2). */
export const DEVTUNNEL_AI_SEARCH_RESULT_LIMIT = 60;

/** Below this score a row is noise (a single passing mention in a description scores 1). */
const AI_MIN_SCORE = 2;

/**
 * How long the active-list snapshot is reused. Five minutes: newly
 * onboarded items appear in AI search almost immediately, while a burst of
 * searches still shares one database read. Bump `LIST_CACHE_VERSION` if a
 * source's stored row shape changes.
 */
const LIST_CACHE_SECONDS = 5 * 60;
const LIST_CACHE_VERSION = "v1";

type AiSearchContext = Context<{ Bindings: Env; Variables: Variables }>;
type Viewer = NonNullable<Variables["user"]>;

/** What one searchable DevTunnel list provides. */
export interface DevtunnelAiSearchSource<Item, Row> {
  /** Log field and rate-limit bucket prefix, e.g. `devtunnel-projects`. */
  name: string;
  /** Loads the searchable rows (Cache API first, then Supabase). */
  loadItems: (c: AiSearchContext, env: ParsedEnv) => Promise<Item[]>;
  /** The fields ranking looks at. */
  toScorable: (item: Item) => ScorableItem;
  /** Maps a ranked item to the list endpoint's own row shape, for this viewer. */
  toRow: (item: Item, viewer: Viewer) => Row;
}

// ---------------------------------------------------------------------------
// Source: DevTunnel projects
// ---------------------------------------------------------------------------

const storedProjectSchema = z.object({
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  primaryLanguage: z.string().nullable(),
  // Re-validated through the same sanitiser the database read uses.
  techStack: z.unknown().transform((raw) => toOnboardingTechStackOrNull(raw)),
  repositoryFullName: z.string().nullable(),
});

function parseStoredProjects(raw: unknown): SearchableProject[] | null {
  const parsed = z.array(storedProjectSchema).safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const projectsAiSearchSource: DevtunnelAiSearchSource<SearchableProject, ProjectSummary> = {
  name: "devtunnel-projects",
  loadItems: (c, env) =>
    getCachedList<SearchableProject>({
      name: "devtunnel-projects",
      version: LIST_CACHE_VERSION,
      ttlSeconds: LIST_CACHE_SECONDS,
      load: () => listSearchableProjects(getSupabase(env)),
      parse: parseStoredProjects,
      waitUntil: (promise) => c.executionCtx.waitUntil(promise),
    }),
  toScorable: (project) => ({
    name: project.name,
    description: project.description,
    techStack: searchableProjectTags(project),
    language: project.primaryLanguage,
  }),
  toRow: (project, viewer) => toProjectSummary(project, contributorMatchProfileFor(viewer)),
};

// ---------------------------------------------------------------------------
// Source: DevTunnel open source tools
// ---------------------------------------------------------------------------

const storedToolSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sourceUrl: z.string(),
  primaryLanguage: z.string().nullable(),
  labels: z.array(z.string()),
  createdAt: z.string(),
});

function parseStoredTools(raw: unknown): OpenSourceToolSummary[] | null {
  const parsed = z.array(storedToolSchema).safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export const toolsAiSearchSource: DevtunnelAiSearchSource<OpenSourceToolSummary, OpenSourceToolSummary> = {
  name: "devtunnel-tools",
  loadItems: (c, env) =>
    getCachedList<OpenSourceToolSummary>({
      name: "devtunnel-tools",
      version: LIST_CACHE_VERSION,
      ttlSeconds: LIST_CACHE_SECONDS,
      load: () => listAvailableOpenSourceTools(getSupabase(env)),
      parse: parseStoredTools,
      waitUntil: (promise) => c.executionCtx.waitUntil(promise),
    }),
  // A tool has no tech-stack tags of its own; its admin-chosen labels
  // ("Frontend Developer", …) play that role, next to its language.
  toScorable: (tool) => ({
    name: tool.name,
    description: tool.description,
    topics: tool.labels,
    language: tool.primaryLanguage,
  }),
  toRow: (tool) => tool,
};

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

/**
 * Shared handler behind both DevTunnel `…/ai-search` routes. The route must
 * already have run `requireAuth`; `beginAiSearch` re-checks the user anyway.
 *
 * Status codes: 400 bad body · 401 no session · 429 rate limited ·
 * 503 `ai_disabled` (AI_FEATURES_ENABLED=false) · 500 the list couldn't be
 * loaded · 200 otherwise — including the keyword fallback, which is a
 * normal, honest answer (`aiUsed: false`). Unlike the GitHub catalogs there
 * is no "warming" state: these lists come straight from the database.
 */
export async function handleDevtunnelAiSearchRequest<Item, Row>(
  c: AiSearchContext,
  source: DevtunnelAiSearchSource<Item, Row>,
) {
  const begun = await beginAiSearch(c, `${source.name}-ai-search`);
  if (!begun.ok) return begun.response;
  const { env, prompt, user } = begun;

  try {
    const items = await source.loadItems(c, env);

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
      const ranked = rankByTerms(items, resolved.interpretation, source.toScorable, {
        limit: DEVTUNNEL_AI_SEARCH_RESULT_LIMIT,
        minScore: AI_MIN_SCORE,
      });
      logger.info("ai_search_served", {
        catalog: source.name,
        aiUsed: true,
        cached: resolved.fromCache,
        resultCount: ranked.length,
        requestId: c.get("requestId"),
      });
      const body: AiSearchResponse<Row> = {
        results: ranked.map((item) => source.toRow(item, user)),
        interpretation: resolved.interpretation,
        aiUsed: true,
        scanned: items.length,
      };
      return c.json(body, 200);
    }

    const fallbackReason = resolved.fallbackReason ?? "unavailable";
    const ranked = rankByPromptKeywords(items, prompt, source.toScorable, {
      limit: DEVTUNNEL_AI_SEARCH_RESULT_LIMIT,
      minScore: 1,
    });
    logger.warn("ai_search_fallback", {
      catalog: source.name,
      reason: fallbackReason,
      resultCount: ranked.length,
      requestId: c.get("requestId"),
    });
    const body: AiSearchResponse<Row> = {
      results: ranked.map((item) => source.toRow(item, user)),
      interpretation: keywordFallbackInterpretation(prompt),
      aiUsed: false,
      fallbackReason,
      scanned: items.length,
    };
    return c.json(body, 200);
  } catch (err) {
    logger.error(`${source.name}_ai_search_failed`, {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't run this search right now");
  }
}
