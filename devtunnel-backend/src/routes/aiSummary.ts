import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { getEnv } from "../config/env";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { GitHubRepoError } from "../lib/githubRepo";
import {
  AiDisabledError,
  AiExhaustedError,
  AiNotConfiguredError,
  AiRequestError,
  aiFeaturesEnabled,
} from "../lib/ai/client";
import { AiJsonError } from "../lib/ai/json";
import {
  SummaryNotEnoughContentError,
  SummaryRateLimitedError,
  SummaryUnusableError,
  getOrCreateSummary,
} from "../lib/ai/summaries";
import { SUMMARY_KINDS, SummarySubjectNotFoundError, normalizeSubjectKey } from "../lib/ai/summarySource";
import type { Env, Variables } from "../types";

/**
 * `POST /ai/summary` — the AI summary card on the five detail pages
 * (Part 4 of the AI build plan; devtunnel-frontend
 * `components/ai/ai-summary.tsx`). Body `{ kind, key }`, where `kind` is one
 * of `devtunnel_project | devtunnel_tool | github_project | github_tool |
 * community_project` and `key` is that page's slug.
 *
 * The flow (stored summary first, model only when needed) lives in
 * `lib/ai/summaries.ts`; this file is only the HTTP edge: sign-in, the
 * AI-off switch, body validation, the per-user generation limit and mapping
 * failures to honest status codes.
 *
 * Signed-in only (Part 1 rule 4) — the endpoint can spend a free-tier AI
 * budget — and switchable off with `AI_FEATURES_ENABLED=false`.
 *
 * Rate limiting: only the path that would CALL A MODEL is limited (6 a
 * minute per user; `allowGeneration` below). Reading a stored summary is a
 * single Supabase row and is deliberately not limited, so ordinary browsing
 * adds no `checkRateLimit` KV writes (Part 1 rule 1). The catch: a signed-in
 * user can request summaries for many different GitHub repositories, but each
 * new one is capped at 6/min and, once stored, is free for everyone.
 *
 * Status codes: 400 bad body/key · 401 no session · 404 no such page ·
 * 422 not enough text to summarise · 429 rate limited · 502 the model's
 * answer was unusable / GitHub unreachable · 503 `ai_disabled` (switched off)
 * or `ai_unavailable` (no provider configured / all out of quota) · 200.
 */

const GENERATIONS_PER_MINUTE = 6;

const requestBodySchema = z.object({
  kind: z.enum(SUMMARY_KINDS),
  key: z.string().trim().min(1, "A page key is required").max(220, "That page key is too long"),
});

export const aiSummary = new Hono<{ Bindings: Env; Variables: Variables }>();

aiSummary.post("/ai/summary", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) return errorResponse(c, 401, "unauthenticated", "Sign-in required");

  if (!aiFeaturesEnabled(env)) {
    return errorResponse(c, 503, "ai_disabled", "AI summaries are turned off right now.");
  }

  const parsed = requestBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(c, 400, "invalid_body", parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const { kind, key } = parsed.data;

  const subjectKey = normalizeSubjectKey(kind, key);
  if (!subjectKey) return errorResponse(c, 404, "not_found", "That page doesn't exist.");

  try {
    const result = await getOrCreateSummary({
      rawEnv: c.env,
      env,
      ctx: c.executionCtx,
      kind,
      subjectKey,
      allowGeneration: () =>
        checkRateLimit(c, {
          bucket: "ai-summary-generate",
          limit: GENERATIONS_PER_MINUTE,
          windowSeconds: 60,
          identity: `user:${user.id}`,
        }),
    });

    return c.json(
      {
        kind,
        key: subjectKey,
        summary: result.summary,
        generatedAt: result.generatedAt,
        cached: result.cached,
      },
      200,
    );
  } catch (err) {
    if (err instanceof SummarySubjectNotFoundError) {
      return errorResponse(c, 404, "not_found", "That page doesn't exist.");
    }
    if (err instanceof SummaryNotEnoughContentError) {
      return errorResponse(c, 422, "not_enough_content", "There isn't enough written about this project to summarise.");
    }
    if (err instanceof SummaryRateLimitedError) {
      return errorResponse(c, 429, "rate_limited", "Too many summaries requested. Try again in a minute.");
    }
    if (err instanceof AiDisabledError) {
      return errorResponse(c, 503, "ai_disabled", "AI summaries are turned off right now.");
    }
    if (err instanceof AiNotConfiguredError || err instanceof AiExhaustedError) {
      const retryAfterSeconds =
        err instanceof AiExhaustedError ? Math.min(Math.max(Math.ceil(err.retryAfterMs / 1000), 30), 3600) : 300;
      c.header("Retry-After", String(retryAfterSeconds));
      return errorResponse(c, 503, "ai_unavailable", "AI summaries aren't available right now. Try again later.");
    }
    if (err instanceof AiJsonError || err instanceof SummaryUnusableError || err instanceof AiRequestError) {
      return errorResponse(c, 502, "ai_unusable", "The AI couldn't produce a usable summary. Try again.");
    }
    if (err instanceof GitHubRepoError) {
      if (err.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", "GitHub is rate limiting requests. Try again shortly.");
      }
      logger.error("ai_summary_github_error", { reason: err.reason, kind, requestId: c.get("requestId") });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now.");
    }

    logger.error("ai_summary_failed", {
      error: err instanceof Error ? err.message : String(err),
      kind,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load this summary right now.");
  }
});
