import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { getProfileActivity, recordTaskView } from "../db/profileActivity";

/**
 * Contributor — the Profile page's activity, and the write that makes
 * "tasks I've seen" possible.
 *
 *  - `POST /tasks/:id/view`          — the task page records that the signed-in
 *    contributor opened it (devtunnel-frontend's `TaskViewTracker`).
 *  - `GET  /users/me/profile-activity` — the projects a contributor has joined
 *    or is contributing to, and every task they have viewed, started,
 *    submitted for review or finished — for the Profile page's Projects and
 *    Tasks tabs (`lib/profile/get-server-profile-activity.ts`).
 *
 * Where each fact comes from, and why the two lists are shaped the way they
 * are, is documented on `getProfileActivity` (src/db/profileActivity.ts).
 *
 * Mounted on the app root in src/index.ts. `POST /tasks/:id/view` shares a
 * prefix with `POST /tasks/:id/start` and `/submit` (src/routes/tasks.ts) but
 * is a different last segment, so Hono never has to choose between them.
 *
 * The rate-limit buckets are counted per user, not per IP: the Profile page
 * reads this from the Next.js Worker on the visitor's behalf, so every visitor
 * would otherwise share one address (see `RateLimitOptions.identity`).
 */
export const profileActivity = new Hono<{ Bindings: Env; Variables: Variables }>();

const taskIdSchema = z.string().uuid("Invalid task id");

/**
 * `POST /tasks/:id/view` — records "this contributor opened this task".
 *
 * A view is attention, not work: it never moves a contribution count, the
 * calendar, or a task's status (sql/036's header is explicit). It exists so
 * the Profile can answer "which tasks have I looked at?".
 *
 * Idempotent (`recordTaskView` upserts on `(task_id, user_id)`), so a refresh
 * or a double-invoked effect returns the same 200 as the first call. A task
 * that doesn't exist, or was soft-deleted, is a 404 — no view is stored for it.
 *
 * `requireAuth` only. The user comes from the session, never the body or the
 * URL, so a caller can only ever record views for themselves.
 */
profileActivity.post("/tasks/:id/view", requireAuth, async (c) => {
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
    bucket: "tasks-view",
    limit: 120,
    windowSeconds: 60,
    identity: `user:${user.id}`,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);
    const recorded = await recordTaskView(supabase, taskIdResult.data, user.id);
    if (!recorded) {
      return errorResponse(c, 404, "task_not_found", "Task not found");
    }
    return c.json({ viewed: true }, 200);
  } catch (err) {
    logger.error("task_view_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't record this view right now");
  }
});

/**
 * `GET /users/me/profile-activity` — `{ projects, tasks }` for the signed-in
 * contributor's Profile.
 *
 * `requireAuth` only, and scoped to `user.id` inside every query, so there is
 * no parameter a caller could change to read anyone else's activity (rule 17).
 * Both lists are empty for a brand-new contributor — the normal "nothing yet"
 * answer, not an error.
 *
 * Response body is the raw payload object, not the `{ data }` envelope — the
 * same documented exception the other `/users/me/*` list routes make.
 */
profileActivity.get("/users/me/profile-activity", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  const withinLimit = await checkRateLimit(c, {
    bucket: "profile-activity",
    limit: 60,
    windowSeconds: 60,
    identity: `user:${user.id}`,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);
    const activity = await getProfileActivity(supabase, user.id);
    return c.json(activity, 200);
  } catch (err) {
    logger.error("profile_activity_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load your activity right now");
  }
});