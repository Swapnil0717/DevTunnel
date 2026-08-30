/** Backend base URL. Public by definition — see .env.example. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** Canonical public origin, used for canonical/OG URLs and the sitemap. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://devtunnel.tech";

export const SITE_NAME = "DevTunnel";

/**
 * sessionStorage key used to hold the CSRF `state` value between
 * redirecting to GitHub and returning to /auth/callback. sessionStorage
 * (not localStorage) so it never outlives the single login attempt/tab.
 */
export const OAUTH_STATE_STORAGE_KEY = "devtunnel.oauth_state";

/**
 * sessionStorage key holding the path the user was trying to reach before
 * being sent to /login, so we can return them there after a successful
 * sign-in.
 */
export const OAUTH_RETURN_TO_STORAGE_KEY = "devtunnel.oauth_return_to";

/** Default route to land on after a successful sign-in. */
export const DEFAULT_POST_LOGIN_ROUTE = "/dashboard";

/**
 * Non-sensitive cookie the backend sets alongside the httpOnly session
 * cookie purely so Next.js middleware can make a fast redirect decision.
 * It must never itself carry auth data — see src/middleware.ts.
 */
export const SESSION_HINT_COOKIE = "dt_session_present";
