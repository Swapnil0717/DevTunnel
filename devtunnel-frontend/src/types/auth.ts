/**
 * Authenticated contributor, as returned by GET /auth/me.
 *
 * Only public-facing profile fields belong here. Rule 17 (Public Developer
 * Pages Must Respect Privacy) — never widen this type to carry tokens,
 * private email, or raw GitHub API payloads.
 */
export interface AuthUser {
  id: string;
  githubUsername: string;
  displayName: string;
  avatarUrl: string;
  githubProfileUrl: string;
  /** ISO 8601 timestamp of account creation. */
  createdAt: string;
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  user: AuthUser | null;
  status: AuthStatus;
  /** Kicks off the GitHub OAuth redirect. Resolves once the browser is navigating away. */
  loginWithGitHub: (returnTo?: string) => Promise<void>;
  /** Re-fetches the current session from the backend (GET /auth/me). */
  refresh: () => Promise<void>;
  /** Clears the session (POST /auth/logout) and local auth state. */
  logout: () => Promise<void>;
}

/** Shape returned by POST /auth/github when starting the OAuth flow. */
export interface GitHubAuthorizeResponse {
  /** GitHub's authorization URL to redirect the browser to. */
  url: string;
  /** Opaque CSRF value the callback must echo back and we must verify. */
  state: string;
}

/** Known error codes the backend may redirect back with on /auth/callback. */
export type AuthErrorCode =
  | "access_denied"
  | "invalid_state"
  | "github_error"
  | "server_error";
