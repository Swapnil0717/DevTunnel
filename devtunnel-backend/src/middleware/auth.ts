import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import type { Env } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { getUserForSessionTokenWithMaintainerStatus } from "../db/sessions";
import { getUserForCliTokenWithMaintainerStatus } from "../db/cliTokens";
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
 * handlers, including `isMaintainer` (devtunnel.project_maintainers —
 * db/devtunnelStats.ts) so every protected route sees the same, fully
 * populated user object `GET /auth/me` returns. Every protected handler
 * must still perform its own authorization (does *this* user own *this*
 * resource) — this middleware only answers "who is making the request",
 * not "are they allowed to do this" (rule 12: authorization must be
 * explicit, separate from authentication).
 *
 * Two credential forms are accepted, checked in this order:
 *  1. The browser's httpOnly session cookie (`dt_session`) — the only
 *     form that existed before devtunnel-cli.
 *  2. `Authorization: Bearer <token>` — a `dev login`-issued CLI token
 *     (devtunnel.cli_tokens, sql/029/db/cliTokens.ts). A CLI process has
 *     no browser to hold an httpOnly cookie in, so it authenticates every
 *     request with this header instead. Checked only when there's no
 *     session cookie, so a browser request that happens to carry a stray
 *     bearer header still authenticates exactly as it always has — this
 *     adds a second way in, it doesn't change the first.
 *
 * Every existing protected route (and every future one mounted behind
 * `requireAuth`) therefore works for the CLI automatically — no route
 * needs its own bearer-token handling.
 */
export const requireAuth: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  const env = getEnv(c.env);
  const sessionToken = getCookie(c, SESSION_COOKIE);
  const authHeader = c.req.header("Authorization");
  const bearerToken = !sessionToken && authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;

  if (!sessionToken && !bearerToken) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  try {
    const supabase = getSupabase(env);

    const result = sessionToken
      ? await getUserForSessionTokenWithMaintainerStatus(supabase, sessionToken)
      : await getUserForCliTokenWithMaintainerStatus(supabase, bearerToken!);

    if (!result) {
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }
    c.set("user", toAuthUser(result.user, result.isMaintainer));
    await next();
  } catch (err) {
    logger.error("auth_lookup_failed", { error: String(err), requestId: c.get("requestId") });
    return errorResponse(c, 500, "internal_error", "Something went wrong");
  }
};