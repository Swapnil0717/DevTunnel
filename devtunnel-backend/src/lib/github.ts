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
 *    & events), not a scope string. Sending one is meaningless here.
 *  - Verified email access requires the app to have **Account
 *    permissions > Email addresses: Read-only** granted (separate from
 *    the "Repository permissions" section) — set that in the GitHub App
 *    settings, not in this code.
 *  - The resulting user access token is a GitHub-App user-to-server
 *    token, which may expire in ~8h if "Expire user authorization
 *    tokens" is on. That's irrelevant here: this backend uses the token
 *    exactly once, immediately, to read the identity below, then issues
 *    its own independent session (src/db/sessions.ts) — GitHub's token
 *    is never stored or reused.
 */
export function buildAuthorizeUrl(env: ValidatedEnv, state: string): string {
  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GITHUB_CALLBACK_URL);
  url.searchParams.set("state", state);
  return url.toString();
}

const tokenResponseSchema = z.union([
  z.object({ access_token: z.string().min(1), token_type: z.string(), scope: z.string().optional() }),
  z.object({ error: z.string(), error_description: z.string().optional() }),
]);

/** rule 50: code exchange step. rule 52: validate the shape before trusting it. */
export async function exchangeCodeForToken(
  env: ValidatedEnv,
  code: string,
): Promise<string> {
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
  return parsed.data.access_token;
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
