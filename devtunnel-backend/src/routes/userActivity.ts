import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { listRecentActivityForUser } from "../db/userActivity";

/**
 * `GET /users/me/activity` — what the signed-in contributor has recently done
 * on DevTunnel (tasks started, pull requests submitted, tasks finished,
 * projects claimed), newest first, one row per task/project — for the Home
 * page's "Recently active" section (devtunnel-frontend's
 * `components/home/recent-activity-list.tsx` via `getRecentActivity` in
 * `lib/home/api.ts`).
 *
 * Replaces the placeholder `GET /contributor/active-projects` that section
 * used to call, which was never built — so it always showed "Recent activity
 * isn't available yet". Where each event comes from, and why it isn't read
 * from `devtunnel.activity_log`, is documented on `listRecentActivityForUser`
 * (src/db/userActivity.ts).
 *
 * `requireAuth` only. Scoped to `user.id` inside every query, so there is no
 * parameter a caller could change to read anyone else's activity (rule 17).
 * Bare array response like `GET /users/me/tasks`; `[]` is the normal "nothing
 * yet" answer for a brand-new contributor, not an error.
 *
 * The rate-limit bucket is counted per user, not per IP, because Home calls
 * this from the Next.js Worker on the visitor's behalf (see
 * `RateLimitOptions.identity` in src/lib/rateLimit.ts).
 */
export const userActivity = new Hono<{ Bindings: Env; Variables: Variables }>();

/** Home shows a short list; 20 is a generous ceiling so `limit` can never be used to force a big read (rules 14–15, 40). */
const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional().default(5),
});

userActivity.get("/users/me/activity", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  const withinLimit = await checkRateLimit(c, {
    bucket: "user-activity",
    limit: 60,
    windowSeconds: 60,
    identity: `user:${user.id}`,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsed = activityQuerySchema.safeParse({ limit: c.req.query("limit") });
  if (!parsed.success) {
    return errorResponse(
      c,
      400,
      "invalid_query",
      parsed.error.issues[0]?.message ?? "Invalid query parameters",
    );
  }

  try {
    const supabase = getSupabase(env);
    const items = await listRecentActivityForUser(supabase, user.id, parsed.data.limit);
    return c.json(items, 200);
  } catch (err) {
    logger.error("user_activity_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load your activity right now");
  }
});