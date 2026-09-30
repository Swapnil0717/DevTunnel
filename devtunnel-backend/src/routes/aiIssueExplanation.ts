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
import {
  EXPLANATION_SOURCES,
  ExplainIssueClosedError,
  ExplainIssueNotFoundError,
  ExplainNotEnoughContentError,
  ExplainRateLimitedError,
  ExplainUnusableError,
  getOrCreateIssueExplanation,
  repoKey,
} from "../lib/ai/issueExplanations";
import type { Env, Variables } from "../types";

/**
 * `POST /ai/issue-explanation` — the "Explain" panel on each issue row
 * (Part 5 of the AI build plan; devtunnel-frontend
 * `components/ai/ai-explain-button.tsx`). Body
 * `{ source: "github" | "devtunnel", repo: "owner/repo", issueNumber }`.
 *
 * The flow (stored explanation first, model only when needed) lives in
 * `lib/ai/issueExplanations.ts`; this file is only the HTTP edge: sign-in,
 * the AI-off switch, body validation, the per-user generation limit and
 * mapping failures to honest status codes. Same structure as
 * `routes/aiSummary.ts`.
 *
 * Signed-in only (Part 1 rule 4) — the endpoint can spend a free-tier AI
 * budget — and switchable off with `AI_FEATURES_ENABLED=false`.
 *
 * Rate limiting: only the path that would CALL A MODEL is limited (6 a
 * minute per user; `allowGeneration`). Reading a stored explanation is one
 * Supabase row and is deliberately not limited, so ordinary clicking adds no
 * `checkRateLimit` KV writes (Part 1 rule 1).
 *
 * Status codes: 400 bad body · 401 no session · 404 no such issue / private
 * repo · 409 issue is closed · 422 issue has no text to explain · 429 rate
 * limited · 502 the model's answer was unusable / GitHub unreachable · 503
 * `ai_disabled` (switched off) or `ai_unavailable` (no provider configured /
 * all out of quota) · 200.
 */

const GENERATIONS_PER_MINUTE = 6;

const requestBodySchema = z.object({
  source: z.enum(EXPLANATION_SOURCES),
  repo: z
    .string()
    .trim()
    .min(3, "A repository is required")
    .max(200, "That repository name is too long")
    .regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, "Repository must look like owner/repo"),
  issueNumber: z.number().int("Issue number must be a whole number").positive("Issue number must be positive").max(10_000_000),
});

export const aiIssueExplanation = new Hono<{ Bindings: Env; Variables: Variables }>();

aiIssueExplanation.post("/ai/issue-explanation", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) return errorResponse(c, 401, "unauthenticated", "Sign-in required");

  if (!aiFeaturesEnabled(env)) {
    return errorResponse(c, 503, "ai_disabled", "AI explanations are turned off right now.");
  }

  const parsed = requestBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(c, 400, "invalid_body", parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const { source, issueNumber } = parsed.data;

  // Same owner/repo character rules the rest of the backend uses before anything reaches GitHub.
  const ref = parseGithubRepoUrl(parsed.data.repo);
  if (!ref) return errorResponse(c, 400, "invalid_body", "Repository must look like owner/repo");

  try {
    const result = await getOrCreateIssueExplanation({
      env,
      ctx: c.executionCtx,
      source,
      owner: ref.owner,
      repo: ref.repo,
      issueNumber,
      allowGeneration: () =>
        checkRateLimit(c, {
          bucket: "ai-issue-explain-generate",
          limit: GENERATIONS_PER_MINUTE,
          windowSeconds: 60,
          identity: `user:${user.id}`,
        }),
    });

    return c.json(
      {
        source,
        repo: repoKey(ref.owner, ref.repo),
        issueNumber,
        explanation: result.explanation,
        generatedAt: result.generatedAt,
        cached: result.cached,
      },
      200,
    );
  } catch (err) {
    if (err instanceof ExplainIssueNotFoundError) {
      return errorResponse(c, 404, "not_found", "That issue couldn't be found.");
    }
    if (err instanceof ExplainIssueClosedError) {
      return errorResponse(c, 409, "issue_closed", "This issue is closed, so there's nothing to work on.");
    }
    if (err instanceof ExplainNotEnoughContentError) {
      return errorResponse(c, 422, "not_enough_content", "This issue has no description to explain.");
    }
    if (err instanceof ExplainRateLimitedError) {
      return errorResponse(c, 429, "rate_limited", "Too many explanations requested. Try again in a minute.");
    }
    if (err instanceof AiDisabledError) {
      return errorResponse(c, 503, "ai_disabled", "AI explanations are turned off right now.");
    }
    if (err instanceof AiNotConfiguredError || err instanceof AiExhaustedError) {
      const retryAfterSeconds =
        err instanceof AiExhaustedError ? Math.min(Math.max(Math.ceil(err.retryAfterMs / 1000), 30), 3600) : 300;
      c.header("Retry-After", String(retryAfterSeconds));
      return errorResponse(c, 503, "ai_unavailable", "AI explanations aren't available right now. Try again later.");
    }
    if (err instanceof AiJsonError || err instanceof ExplainUnusableError || err instanceof AiRequestError) {
      return errorResponse(c, 502, "ai_unusable", "The AI couldn't produce a usable explanation. Try again.");
    }
    if (err instanceof GitHubRepoError) {
      if (err.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", "GitHub is rate limiting requests. Try again shortly.");
      }
      if (err.reason === "not_found") {
        return errorResponse(c, 404, "not_found", "That issue couldn't be found.");
      }
      logger.error("ai_issue_explanation_github_error", { reason: err.reason, requestId: c.get("requestId") });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now.");
    }

    logger.error("ai_issue_explanation_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load this explanation right now.");
  }
});
