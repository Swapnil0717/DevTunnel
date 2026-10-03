import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { saveContributionFeedback } from "../db/contributionFeedback";

/**
 * Contributor — feedback after opening a pull request.
 *
 *  - `POST /tasks/:id/feedback` — saves a 1–5 rating and an optional message
 *    from the task's contributor (devtunnel-frontend's `PostPrPrompt`, the
 *    "Give feedback" option on the task Contribute page).
 *
 * "Sponsor DevTunnel" on that same prompt is a plain link to an external
 * payment page; DevTunnel takes no payment and records nothing about it, so
 * there is no route for it here.
 *
 * Mounted on the app root in src/index.ts. Shares a prefix with
 * `POST /tasks/:id/start`, `/submit` and `/view` but differs in the last
 * segment, so Hono never has to choose between them.
 *
 * Rate-limited per user, not per IP: the browser calls this directly, but the
 * limit should follow the person rather than a shared network address.
 */
export const contributionFeedback = new Hono<{ Bindings: Env; Variables: Variables }>();

const taskIdSchema = z.string().uuid("Invalid task id");

const feedbackBodySchema = z.object({
  rating: z.number().int("Rating must be a whole number").min(1, "Pick a rating from 1 to 5").max(5, "Pick a rating from 1 to 5"),
  message: z
    .string()
    .max(1000, "Keep your message under 1000 characters")
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    }),
});

/**
 * `POST /tasks/:id/feedback` — body `{ rating: 1–5, message?: string }`.
 *
 * `requireAuth` only. The user comes from the session, never the body, so a
 * caller can only ever leave feedback as themselves. The task must be theirs
 * and have an open (or accepted) pull request (`saveContributionFeedback`):
 * a task that doesn't exist is a 404, one that isn't theirs or has no pull
 * request yet is a 403.
 *
 * Idempotent per `(task, user)`: sending it again replaces the earlier answer.
 */
contributionFeedback.post("/tasks/:id/feedback", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  const taskIdResult = taskIdSchema.safeParse(c.req.param("id"));
  if (!taskIdResult.success) {
    return errorResponse(c, 400, "invalid_request", taskIdResult.error.issues[0]!.message);
  }

  const withinLimit = await checkRateLimit(c, {
    bucket: "tasks-feedback",
    limit: 10,
    windowSeconds: 60,
    identity: `user:${user.id}`,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return errorResponse(c, 400, "invalid_request", "Request body must be valid JSON");
  }

  const bodyResult = feedbackBodySchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return errorResponse(c, 400, "invalid_request", bodyResult.error.issues[0]!.message);
  }

  try {
    const supabase = getSupabase(env);
    const result = await saveContributionFeedback(supabase, taskIdResult.data, user.id, bodyResult.data);

    if (result === "task_not_found") {
      return errorResponse(c, 404, "task_not_found", "Task not found");
    }
    if (result === "not_eligible") {
      return errorResponse(
        c,
        403,
        "feedback_not_available",
        "Feedback opens once you've submitted a pull request for this task",
      );
    }
    return c.json({ saved: true }, 200);
  } catch (err) {
    logger.error("contribution_feedback_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't save your feedback right now");
  }
});
