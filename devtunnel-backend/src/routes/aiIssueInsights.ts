import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { getEnv } from "../config/env";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { GitHubRepoError, parseGithubRepoUrl } from "../lib/githubRepo";
import {
  AiDisabledError,
  AiExhaustedError,
  AiNotConfiguredError,
  AiRequestError,
  aiFeaturesEnabled,
} from "../lib/ai/client";
import { AiJsonError } from "../lib/ai/json";
import { INSIGHTS_MAX_ISSUES } from "../lib/ai/prompts/insights";
import {
  InsightsNoIssuesError,
  InsightsRateLimitedError,
  InsightsRepoNotFoundError,
  InsightsUnusableError,
  getOrCreateIssueInsights,
  insightsRepoKey,
} from "../lib/ai/issueInsights";
import type { Env, Variables } from "../types";

/**
 * `POST /ai/issue-insights` — the "AI issue insights" card at the top of a
 * repository's Issues tab (Part 6 of the AI build plan; devtunnel-frontend
 * `components/ai/issue-insights-card.tsx`). Body `{ repo: "owner/repo" }`,
 * plus optionally `issueNumbers` (at most `INSIGHTS_MAX_ISSUES`): the open
 * issues that have no insight yet, used after "Load all issues" and on the
 * All Issues page. Only the numbers are accepted — the issue text is always
 * read from GitHub by the Worker — and only issues without a stored insight
 * cost a model call (see "Filling the gaps" in `lib/ai/issueInsights.ts`).
 *
 * The flow (stored insights first, model only when needed) lives in
 * `lib/ai/issueInsights.ts`; this file is only the HTTP edge: sign-in, the
 * AI-off switch, body validation, the per-user generation limit and mapping
 * failures to honest status codes. Same structure as
 * `routes/aiIssueExplanation.ts`.
 *
 * Signed-in only (Part 1 rule 4) — the endpoint can spend a free-tier AI
 * budget — and switchable off with `AI_FEATURES_ENABLED=false`.
 *
 * Rate limiting: only the path that would CALL A MODEL is limited (4 a
 * minute per user; `allowGeneration`). Reading stored insights is one
 * Supabase row and is deliberately not limited, so ordinary visits add no
 * `checkRateLimit` KV writes (Part 1 rule 1).
 *
 * Status codes: 400 bad body · 401 no session · 404 no such repository /
 * private repo · 422 the repository has no open issues · 429 rate limited ·
 * 502 the model's answer was unusable / GitHub unreachable · 503
 * `ai_disabled` (switched off) or `ai_unavailable` (no provider configured /
 * all out of quota) · 200.
 */

const GENERATIONS_PER_MINUTE = 4;

const requestBodySchema = z.object({
  repo: z
    .string()
    .trim()
    .min(3, "A repository is required")
    .max(200, "That repository name is too long")
    .regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, "Repository must look like owner/repo"),
  issueNumbers: z
    .array(z.number().int().positive().max(999_999_999))
    .min(1, "issueNumbers can't be empty")
    .max(INSIGHTS_MAX_ISSUES, `At most ${INSIGHTS_MAX_ISSUES} issues can be analyzed per request`)
    .optional(),
});

export const aiIssueInsights = new Hono<{ Bindings: Env; Variables: Variables }>();

aiIssueInsights.post("/ai/issue-insights", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) return errorResponse(c, 401, "unauthenticated", "Sign-in required");

  if (!aiFeaturesEnabled(env)) {
    return errorResponse(c, 503, "ai_disabled", "AI issue insights are turned off right now.");
  }

  const parsed = requestBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(c, 400, "invalid_body", parsed.error.issues[0]?.message ?? "Invalid request");
  }

  // Same owner/repo character rules the rest of the backend uses before anything reaches GitHub.
  const ref = parseGithubRepoUrl(parsed.data.repo);
  if (!ref) return errorResponse(c, 400, "invalid_body", "Repository must look like owner/repo");

  try {
    const result = await getOrCreateIssueInsights({
      env,
      ctx: c.executionCtx,
      owner: ref.owner,
      repo: ref.repo,
      requestedNumbers: parsed.data.issueNumbers,
      allowGeneration: () =>
        checkRateLimit(c, {
          bucket: "ai-issue-insights-generate",
          limit: GENERATIONS_PER_MINUTE,
          windowSeconds: 60,
          identity: `user:${user.id}`,
        }),
    });

    return c.json(
      {
        repo: insightsRepoKey(ref.owner, ref.repo),
        insights: result.insights,
        analyzedIssueCount: result.analyzedIssueCount,
        generatedAt: result.generatedAt,
        cached: result.cached,
      },
      200,
    );
  } catch (err) {
    if (err instanceof InsightsRepoNotFoundError) {
      return errorResponse(c, 404, "not_found", "That repository couldn't be found.");
    }
    if (err instanceof InsightsNoIssuesError) {
      return errorResponse(c, 422, "no_issues", "This repository has no open issues to analyze.");
    }
    if (err instanceof InsightsRateLimitedError) {
      return errorResponse(c, 429, "rate_limited", "Too many analyses requested. Try again in a minute.");
    }
    if (err instanceof AiDisabledError) {
      return errorResponse(c, 503, "ai_disabled", "AI issue insights are turned off right now.");
    }
    if (err instanceof AiNotConfiguredError || err instanceof AiExhaustedError) {
      const retryAfterSeconds =
        err instanceof AiExhaustedError ? Math.min(Math.max(Math.ceil(err.retryAfterMs / 1000), 30), 3600) : 300;
      c.header("Retry-After", String(retryAfterSeconds));
      return errorResponse(c, 503, "ai_unavailable", "AI issue insights aren't available right now. Try again later.");
    }
    if (err instanceof AiJsonError || err instanceof InsightsUnusableError || err instanceof AiRequestError) {
      return errorResponse(c, 502, "ai_unusable", "The AI couldn't produce usable insights. Try again.");
    }
    if (err instanceof GitHubRepoError) {
      if (err.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", "GitHub is rate limiting requests. Try again shortly.");
      }
      if (err.reason === "not_found") {
        return errorResponse(c, 404, "not_found", "That repository couldn't be found.");
      }
      logger.error("ai_issue_insights_github_error", { reason: err.reason, requestId: c.get("requestId") });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now.");
    }

    logger.error("ai_issue_insights_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load these insights right now.");
  }
});