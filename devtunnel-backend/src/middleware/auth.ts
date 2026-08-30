import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { getUserForSessionToken } from "../db/sessions";
import { toAuthUser } from "../db/users";
import { SESSION_COOKIE } from "../lib/cookies";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";

/**
 * Server-side session verification (rule 11: authentication must be
 * server-side). Mount on any route — present or future — that must only
 * be reachable by a signed-in user; `GET /auth/me` uses the same lookup
 * directly since it needs to answer 401 without throwing.
 *
 * Attaches the resolved `AuthUser` to the context as `user` for downstream
 * handlers. Every protected handler must still perform its own
 * authorization (does *this* user own *this* resource) — this middleware
 * only answers "who is making the request", not "are they allowed to do
 * this" (rule 12: authorization must be explicit, separate from
 * authentication).
 */
export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const env = getEnv(c.env);
  const token = getCookie(c, SESSION_COOKIE);

  if (!token) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  try {
    const supabase = getSupabase(env);
    const userRow = await getUserForSessionToken(supabase, token);
    if (!userRow) {
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }
    c.set("user", toAuthUser(userRow));
    await next();
  } catch (err) {
    logger.error("session_lookup_failed", { error: String(err), requestId: c.get("requestId") });
    return errorResponse(c, 500, "internal_error", "Something went wrong");
  }
};
