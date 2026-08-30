/**
 * Cookie contract between this frontend and the DevTunnel backend.
 *
 * Assumption (documented because the backend isn't part of this deliverable):
 * after a successful `POST /auth/github` -> GitHub -> `GET /auth/callback`
 * flow, the backend sets **two** cookies on the frontend's domain:
 *
 *  - `dt_session` — the real session token. `httpOnly`, `Secure`, `SameSite=Lax`.
 *    Only the backend ever reads this; the frontend never touches it directly.
 *  - `dt_auth`    — a small, non-sensitive "am I logged in" flag (e.g. "1"),
 *    NOT httpOnly, with the same lifetime as the session. It carries no
 *    identity or permission data, so it is safe to read from the Edge
 *    middleware for fast redirects.
 *
 * The flag cookie is a UX optimization only. It must never be treated as
 * proof of identity — every protected server layout re-verifies the real
 * session against `GET /auth/me` (see (protected)/layout.tsx), and the
 * backend must independently authorize every request regardless of what
 * the frontend believes (rule 18: private pages must not rely on
 * client-side gating alone).
 */
export const AUTH_FLAG_COOKIE = "dt_auth";
