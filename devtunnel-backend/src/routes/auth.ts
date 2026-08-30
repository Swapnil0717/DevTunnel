import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import type { Env, Variables } from "../types";
import { getEnv, sessionTtlSeconds } from "../config/env";
import { getSupabase } from "../lib/supabase";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchGitHubIdentity,
  GitHubOAuthError,
} from "../lib/github";
import { randomToken, signOAuthState, verifyOAuthState } from "../lib/crypto";
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  setOAuthStateCookie,
  clearOAuthStateCookie,
  setSessionCookies,
  clearSessionCookies,
} from "../lib/cookies";
import { upsertUserFromGitHub, toAuthUser } from "../db/users";
import { createSession, getUserForSessionToken, revokeSessionByToken } from "../db/sessions";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";

export const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Only ever allow redirecting back into this same app after login
 * (devtunnel_workflow.txt Module C1 + Backend_Development_Rules.txt rule
 * 50 context: never let attacker-controlled input steer where the browser
 * ends up after auth). Must be an internal, absolute-from-root path —
 * anything else (protocol-relative `//evil.com`, absolute URLs, bare
 * strings) is rejected in favor of the default.
 */
function sanitizeNextPath(next: string | undefined | null): string {
  const fallback = "/dashboard";
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.includes("://")) return fallback;
  return next;
}

/**
 * `POST /auth/github` (devtunnel_workflow.txt, Module C1).
 *
 * The frontend's `GithubLoginButton` submits a real HTML form here, so
 * this must respond with a redirect the browser will follow directly —
 * not a JSON body. Sets a short-lived, signed, httpOnly cookie carrying a
 * random `state` value (+ the sanitized `next` destination) so the
 * callback can verify this exact browser initiated the request (rule 50:
 * OAuth state validation; CSRF protection for the flow).
 */
auth.post("/github", async (c) => {
  const env = getEnv(c.env);

  const withinLimit = await checkRateLimit(c, { bucket: "auth-github", limit: 20, windowSeconds: 60 });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many sign-in attempts. Try again shortly.");
  }

  let next = "/dashboard";
  try {
    const body = await c.req.parseBody();
    next = sanitizeNextPath(typeof body.next === "string" ? body.next : undefined);
  } catch {
    // No/unparseable body (e.g. a plain navigation) is fine — use the default.
  }

  const state = randomToken(16);
  const signedCookie = await signOAuthState({ state, next }, env.SESSION_HMAC_SECRET);
  setOAuthStateCookie(c, env, signedCookie);

  return c.redirect(buildAuthorizeUrl(env, state), 302);
});

/**
 * `GET /auth/callback` (devtunnel_workflow.txt, Module C1).
 *
 * GitHub-only endpoint — the browser lands here after the user approves
 * (or denies) access on GitHub. Never called directly by frontend JS (see
 * devtunnel-frontend/src/lib/auth/api.ts). On completion, redirects to the
 * frontend's `/auth/callback?status=success&next=...` or
 * `?status=error&reason=...`, matching what OAuthCallbackView expects.
 */
auth.get("/callback", async (c) => {
  const env = getEnv(c.env);

  const toFrontendError = (reason: string) => {
    const url = new URL("/auth/callback", env.FRONTEND_URL);
    url.searchParams.set("status", "error");
    url.searchParams.set("reason", reason);
    return c.redirect(url.toString(), 302);
  };

  const withinLimit = await checkRateLimit(c, { bucket: "auth-callback", limit: 20, windowSeconds: 60 });
  if (!withinLimit) {
    return toFrontendError("rate_limited");
  }

  const code = c.req.query("code");
  const stateParam = c.req.query("state");
  const stateCookie = getCookie(c, OAUTH_STATE_COOKIE);
  clearOAuthStateCookie(c, env);

  if (!code || !stateParam || !stateCookie) {
    return toFrontendError("access_denied");
  }

  const verified = await verifyOAuthState(stateCookie, env.SESSION_HMAC_SECRET);
  if (!verified || verified.state !== stateParam) {
    logger.warn("oauth_state_mismatch", { requestId: c.get("requestId") });
    return toFrontendError("invalid_state");
  }

  try {
    const accessToken = await exchangeCodeForToken(env, code);
    const identity = await fetchGitHubIdentity(accessToken);

    const supabase = getSupabase(env);
    const userRow = await upsertUserFromGitHub(supabase, identity);

    const sessionToken = await createSession(
      supabase,
      userRow.id,
      sessionTtlSeconds(env),
      c.req.header("user-agent") ?? null,
    );

    setSessionCookies(c, env, sessionToken, sessionTtlSeconds(env));

    const successUrl = new URL("/auth/callback", env.FRONTEND_URL);
    successUrl.searchParams.set("status", "success");
    successUrl.searchParams.set("next", verified.next);
    return c.redirect(successUrl.toString(), 302);
  } catch (err) {
    if (err instanceof GitHubOAuthError) {
      logger.warn("github_oauth_failed", { reason: err.reason, requestId: c.get("requestId") });
      return toFrontendError(err.reason);
    }
    logger.error("oauth_callback_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return toFrontendError("server_error");
  }
});

/**
 * `GET /auth/me` (devtunnel_workflow.txt, Module C1).
 *
 * devtunnel-frontend/src/lib/auth/api.ts treats a 401 here as the
 * expected "signed out" response, not an error — so this route resolves
 * the session itself instead of using `requireAuth` (which would also
 * return 401, but framing it through the shared middleware would make an
 * ordinary signed-out page load look like a security event in logs).
 */
auth.get("/me", async (c) => {
  const env = getEnv(c.env);

  const withinLimit = await checkRateLimit(c, { bucket: "auth-me", limit: 120, windowSeconds: 60 });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests.");
  }

  const token = getCookie(c, SESSION_COOKIE);
  if (!token) {
    return errorResponse(c, 401, "unauthenticated", "Not signed in");
  }

  const supabase = getSupabase(env);
  const userRow = await getUserForSessionToken(supabase, token);
  if (!userRow) {
    return errorResponse(c, 401, "unauthenticated", "Not signed in");
  }

  return c.json({ user: toAuthUser(userRow) }, 200);
});

/**
 * `POST /auth/logout` (devtunnel_workflow.txt, Module C1).
 *
 * Revokes the session server-side (deletes the row, not just the cookie —
 * see db/sessions.ts) and clears both cookies. Idempotent: calling this
 * with no session, or an already-revoked session, still returns 200.
 */
auth.post("/logout", async (c) => {
  const env = getEnv(c.env);
  const token = getCookie(c, SESSION_COOKIE);

  if (token) {
    try {
      const supabase = getSupabase(env);
      await revokeSessionByToken(supabase, token);
    } catch (err) {
      // Still clear cookies even if the DB write fails — a stuck cookie
      // with a dead session is worse than a session row that outlives its
      // cookie and simply expires on its own TTL.
      logger.error("logout_revoke_failed", {
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
    }
  }

  clearSessionCookies(c, env);
  return c.json({ success: true }, 200);
});
