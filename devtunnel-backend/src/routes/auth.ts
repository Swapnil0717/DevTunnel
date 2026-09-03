import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
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
import { upsertUserFromGitHub, toAuthUser, completeOnboarding } from "../db/users";
import { createSession, getUserForSessionToken, revokeSessionByToken } from "../db/sessions";
import { persistGithubTokens } from "../db/githubTokens";
import { getIsMaintainer } from "../db/devtunnelStats";
import { requireAuth } from "../middleware/auth";
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
 *
 * Defaults to `/home` — the real contributor landing page
 * (devtunnel_workflow.txt Module C1: sign-in → onboarding → home) — not
 * `/dashboard`, which has no content of its own and exists only as a
 * bookmark-compatibility redirect on the frontend.
 */
function sanitizeNextPath(next: string | undefined | null): string {
  const fallback = "/home";
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.includes("://")) return fallback;
  return next;
}

/**
 * Validation schema for `PATCH /auth/onboarding`. Mirrors `OnboardingData`
 * in devtunnel-frontend/src/lib/onboarding/types.ts. `developerRole`,
 * `experienceLevel`, and `intent` are required (not nullable) because the
 * wizard's own UI (`OnboardingWizard.canContinue`) never lets the user
 * reach the final "Finish setup" step without them — but the backend
 * re-validates independently rather than trusting that (rule 15: never
 * trust frontend validation). `bio`, `skills`, `technologies`, and
 * `interests` are optional/unbounded-by-the-wizard, so they're validated
 * but not required.
 */
const onboardingSchema = z.object({
  bio: z.string().trim().max(500).optional().default(""),
  skills: z.array(z.string().trim().min(1).max(50)).max(20).optional().default([]),
  technologies: z.array(z.string().trim().min(1).max(50)).max(20).optional().default([]),
  developerRole: z.enum([
    "FRONTEND",
    "BACKEND",
    "FULL_STACK",
    "DOCUMENTATION",
    "TESTING",
    "DEVOPS",
  ]),
  experienceLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  interests: z.array(z.string().trim().min(1).max(50)).max(20).optional().default([]),
  intent: z.enum(["START_PROJECT", "FIND_PROJECT"]),
});

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

  let next = "/home";
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
 * Note that `OAuthCallbackView` itself still overrides this `next` to
 * `/onboarding` for a first-time sign-in — see that component.
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
    const tokens = await exchangeCodeForToken(env, code);
    const identity = await fetchGitHubIdentity(tokens.accessToken);

    const supabase = getSupabase(env);
    const userRow = await upsertUserFromGitHub(supabase, identity);

    // Best-effort: persisting the GitHub token bundle powers the profile
    // contribution calendar (src/routes/contributions.ts), but it is not
    // essential to signing in. A failure here must not block an otherwise
    // successful login — logged loudly instead (rule 21: never silently
    // swallow an error; this one is deliberately non-fatal to the request
    // it's attached to, same pattern as the session `last_used_at` touch
    // in src/db/sessions.ts).
    try {
      await persistGithubTokens(supabase, env, userRow.id, tokens);
    } catch (err) {
      logger.error("github_token_persist_failed", {
        userId: userRow.id,
        error: err instanceof Error ? err.message : String(err),
        requestId: c.get("requestId"),
      });
    }

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
 *
 * Includes `isMaintainer` (devtunnel.project_maintainers —
 * db/devtunnelStats.ts `getIsMaintainer`) alongside the onboarding
 * fields already on `UserRow`, so the profile page's badges
 * (components/profile/profile-tags.tsx) and stats have everything they
 * need from this single call.
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

  const isMaintainer = await getIsMaintainer(supabase, userRow.id);
  return c.json({ user: toAuthUser(userRow, isMaintainer) }, 200);
});

/**
 * `PATCH /auth/onboarding` (devtunnel_workflow.txt, Module C1 — "User
 * onboarding" screen). Matches the contract already documented in
 * devtunnel-frontend/src/lib/onboarding/api.ts. Requires a signed-in
 * session (rule 11) and validates the full body server-side (rules 14–15)
 * even though the wizard's UI already gates step advancement. The user id
 * is taken exclusively from the verified session (`requireAuth`), never
 * from the request body, so a signed-in user can only ever update their
 * own row (rule 12).
 */
auth.patch("/onboarding", requireAuth, async (c) => {
  const env = getEnv(c.env);

  const withinLimit = await checkRateLimit(c, { bucket: "auth-onboarding", limit: 20, windowSeconds: 60 });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, 400, "invalid_json", "Request body must be valid JSON");
  }

  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      c,
      422,
      "validation_error",
      parsed.error.issues[0]?.message ?? "Invalid onboarding data",
    );
  }

  const user = c.get("user");
  if (!user) {
    // requireAuth already guarantees this is set — kept for type safety.
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  try {
    const supabase = getSupabase(env);
    const updatedRow = await completeOnboarding(supabase, user.id, parsed.data);
    // `user.isMaintainer` already comes from `requireAuth`, which just
    // resolved it for this same request — no need to look it up twice.
    return c.json({ user: toAuthUser(updatedRow, user.isMaintainer) }, 200);
  } catch (err) {
    logger.error("onboarding_update_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Something went wrong");
  }
});

/**
 * `POST /auth/logout` (devtunnel_workflow.txt, Module C1).
 *
 * Revokes the session server-side (deletes the row, not just the cookie —
 * see db/sessions.ts) and clears both cookies. Idempotent: calling this
 * with no session, or an already-revoked session, still returns 200.
 * Deliberately does NOT clear stored GitHub tokens — logging out of
 * DevTunnel and revoking DevTunnel's stored GitHub authorization are
 * different actions; the user can sign back in without re-approving
 * GitHub as long as their GitHub token is still valid.
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