import type { Context } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import type { ValidatedEnv } from "../config/env";

/**
 * Cookie names and semantics are fixed by the frontend's documented
 * contract (devtunnel-frontend/src/lib/auth/session.ts):
 *
 *  - `dt_session`: the real session token. httpOnly — only this backend
 *    ever reads it. Proves identity.
 *  - `dt_auth`: a non-httpOnly "am I logged in" flag with no identity data,
 *    read by the frontend's Edge middleware for a fast redirect. It is
 *    never treated as proof of identity by anyone — `GET /auth/me` is the
 *    real check (rule 11: authentication must be server-side).
 */
export const SESSION_COOKIE = "dt_session";
export const AUTH_FLAG_COOKIE = "dt_auth";
export const OAUTH_STATE_COOKIE = "dt_oauth_state";

function baseAttrs(env: ValidatedEnv) {
  return {
    domain: env.COOKIE_DOMAIN,
    path: "/",
    secure: env.ENVIRONMENT !== "development",
    sameSite: "Lax" as const,
  };
}

export function setSessionCookies(
  c: Context,
  env: ValidatedEnv,
  token: string,
  maxAgeSeconds: number,
) {
  setCookie(c, SESSION_COOKIE, token, {
    ...baseAttrs(env),
    httpOnly: true,
    maxAge: maxAgeSeconds,
  });
  setCookie(c, AUTH_FLAG_COOKIE, "1", {
    ...baseAttrs(env),
    httpOnly: false,
    maxAge: maxAgeSeconds,
  });
}

export function clearSessionCookies(c: Context, env: ValidatedEnv) {
  deleteCookie(c, SESSION_COOKIE, { domain: env.COOKIE_DOMAIN, path: "/" });
  deleteCookie(c, AUTH_FLAG_COOKIE, { domain: env.COOKIE_DOMAIN, path: "/" });
}

/** Short-lived, httpOnly cookie carrying the signed OAuth `state` + `next`. */
export function setOAuthStateCookie(c: Context, env: ValidatedEnv, signedValue: string) {
  setCookie(c, OAUTH_STATE_COOKIE, signedValue, {
    ...baseAttrs(env),
    httpOnly: true,
    maxAge: 600, // 10 minutes — long enough for the GitHub authorize screen, no longer.
    path: "/auth",
  });
}

export function clearOAuthStateCookie(c: Context, env: ValidatedEnv) {
  deleteCookie(c, OAUTH_STATE_COOKIE, { domain: env.COOKIE_DOMAIN, path: "/auth" });
}
