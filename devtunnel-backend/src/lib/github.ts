import { z } from "zod";
import type { ValidatedEnv } from "../config/env";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";

const REQUEST_TIMEOUT_MS = 8000;
const USER_AGENT = "devtunnel-backend";

export class GitHubOAuthError extends Error {
  /** Safe-to-show-the-user reason code, e.g. surfaced as ?reason=... */
  reason: string;
  constructor(reason: string, message: string) {
    super(message);
    this.name = "GitHubOAuthError";
    this.reason = reason;
  }
}

/** rule 53: never let an external request hang indefinitely. */
async function fetchWithTimeout(input: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * DevTunnel.tech is registered as a **GitHub App** (not an OAuth App) —
 * confirmed via Settings > Developer settings > GitHub Apps > DevTunnel.tech,
 * App ID 4767532. The user-identity ("Sign in with GitHub") flow for a
 * GitHub App reuses the same `/login/oauth/authorize` and
 * `/login/oauth/access_token` endpoints as a classic OAuth App, but:
 *
 *  - No `scope` parameter — a GitHub App's access is entirely defined by
 *    the permissions configured on the app itself (Settings > Permissions
 *    & events), not a scope string.
 *  - Verified email access requires the app to have **Account
 *    permissions > Email addresses: Read-only** granted — set that in the
 *    GitHub App settings, not in this code.
 *  - The resulting user access token is a GitHub-App **user-to-server**
 *    token. If the App has "Expire user authorization tokens" enabled,
 *    it expires (commonly ~8h) and GitHub also issues a longer-lived
 *    refresh token; if that setting is off, the access token doesn't
 *    expire and no refresh token is issued. Both shapes are handled
 *    below (`expires_in`/`refresh_token`/`refresh_token_expires_in` are
 *    all optional in the response schema) — this backend doesn't assume
 *    which mode is configured.
 *
 * Unlike the original version of this file, the token is no longer used
 * once and discarded: src/db/githubTokens.ts persists it (encrypted)
 * per-user, so devtunnel-backend can later call the GitHub GraphQL API
 * (contribution calendar, src/routes/contributions.ts) using each user's
 * own authorization rather than a separate server-wide credential.
 */
export function buildAuthorizeUrl(env: ValidatedEnv, state: string): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GITHUB_CALLBACK_URL);
  url.searchParams.set("state", state);
  return url.toString();
}

const tokenResponseSchema = z.union([
  z.object({
    access_token: z.string().min(1),
    token_type: z.string(),
    scope: z.string().optional(),
    expires_in: z.number().positive().optional(),
    refresh_token: z.string().min(1).optional(),
    refresh_token_expires_in: z.number().positive().optional(),
  }),
  z.object({ error: z.string(), error_description: z.string().optional() }),
]);

/** Everything this backend needs to store/refresh a user's GitHub authorization. */
export interface GitHubTokenBundle {
  accessToken: string;
  /** ISO 8601, or null if the App isn't configured to expire user tokens. */
  accessTokenExpiresAt: string | null;
  /** null if the App isn't configured to expire user tokens (no refresh token issued). */
  refreshToken: string | null;
  /** ISO 8601, or null when there's no refresh token. */
  refreshTokenExpiresAt: string | null;
}

function toTokenBundle(data: {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}): GitHubTokenBundle {
  const now = Date.now();
  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: data.expires_in ? new Date(now + data.expires_in * 1000).toISOString() : null,
    refreshToken: data.refresh_token ?? null,
    refreshTokenExpiresAt: data.refresh_token_expires_in
      ? new Date(now + data.refresh_token_expires_in * 1000).toISOString()
      : null,
  };
}

/** rule 50: code exchange step. rule 52: validate the shape before trusting it. */
export async function exchangeCodeForToken(
  env: ValidatedEnv,
  code: string,
): Promise<GitHubTokenBundle> {
  const res = await fetchWithTimeout(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_CALLBACK_URL,
    }),
  });

  if (!res.ok) {
    throw new GitHubOAuthError("github_unavailable", `GitHub token endpoint returned ${res.status}`);
  }

  const parsed = tokenResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new GitHubOAuthError("github_unavailable", "Unexpected GitHub token response shape");
  }
  if ("error" in parsed.data) {
    throw new GitHubOAuthError("access_denied", parsed.data.error_description ?? parsed.data.error);
  }
  return toTokenBundle(parsed.data);
}

/**
 * Exchanges a stored refresh token for a fresh access token (only
 * meaningful when the App has "Expire user authorization tokens" on).
 * Called from src/db/githubTokens.ts when a stored access token is
 * expired/near-expiry. A `GitHubOAuthError` here (e.g. `access_denied`
 * because the refresh token itself expired or was revoked) signals the
 * caller to fall back to "the user needs to sign in with GitHub again" —
 * never retried silently.
 */
export async function refreshAccessToken(
  env: ValidatedEnv,
  refreshToken: string,
): Promise<GitHubTokenBundle> {
  const res = await fetchWithTimeout(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new GitHubOAuthError("github_unavailable", `GitHub token refresh endpoint returned ${res.status}`);
  }

  const parsed = tokenResponseSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new GitHubOAuthError("github_unavailable", "Unexpected GitHub token refresh response shape");
  }
  if ("error" in parsed.data) {
    throw new GitHubOAuthError("access_denied", parsed.data.error_description ?? parsed.data.error);
  }
  return toTokenBundle(parsed.data);
}

const githubUserSchema = z.object({
  id: z.number(),
  login: z.string().min(1),
  name: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  html_url: z.string().url(),
  bio: z.string().nullable().optional(),
});

const githubEmailsSchema = z.array(
  z.object({
    email: z.string().email(),
    primary: z.boolean(),
    verified: z.boolean(),
  }),
);

export interface GitHubIdentity {
  githubId: string;
  githubUsername: string;
  githubProfileUrl: string;
  name: string | null;
  avatarUrl: string | null;
  bio: string | null;
  email: string;
}

/**
 * Fetches the authenticated GitHub identity for the freshly-issued access
 * token, falling back to `/user/emails` when the primary profile doesn't
 * expose a public email (rule 52: validate before trusting; never trust
 * unverified user-supplied identity per rule 50).
 */
export async function fetchGitHubIdentity(accessToken: string): Promise<GitHubIdentity> {
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
  };

  const userRes = await fetchWithTimeout(GITHUB_USER_URL, { headers: authHeaders });
  if (!userRes.ok) {
    throw new GitHubOAuthError("github_unavailable", `GitHub /user returned ${userRes.status}`);
  }
  const userParsed = githubUserSchema.safeParse(await userRes.json());
  if (!userParsed.success) {
    throw new GitHubOAuthError("github_unavailable", "Unexpected GitHub /user response shape");
  }
  const profile = userParsed.data;

  let email = profile.email ?? null;
  if (!email) {
    const emailsRes = await fetchWithTimeout(GITHUB_EMAILS_URL, { headers: authHeaders });
    if (emailsRes.ok) {
      const emailsParsed = githubEmailsSchema.safeParse(await emailsRes.json());
      if (emailsParsed.success) {
        const primaryVerified = emailsParsed.data.find((e) => e.primary && e.verified);
        const anyVerified = emailsParsed.data.find((e) => e.verified);
        email = (primaryVerified ?? anyVerified)?.email ?? null;
      }
    }
  }

  if (!email) {
    throw new GitHubOAuthError(
      "email_required",
      "GitHub account has no verified email address available",
    );
  }

  return {
    githubId: String(profile.id),
    githubUsername: profile.login,
    githubProfileUrl: profile.html_url,
    name: profile.name ?? null,
    avatarUrl: profile.avatar_url ?? null,
    bio: profile.bio ?? null,
    email,
  };
}