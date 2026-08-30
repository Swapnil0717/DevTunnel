import { apiFetch } from "./api";
import {
  OAUTH_RETURN_TO_STORAGE_KEY,
  OAUTH_STATE_STORAGE_KEY,
} from "./constants";
import type { AuthUser, GitHubAuthorizeResponse } from "@/types/auth";

/**
 * Step 1 of Module C1's OAuth flow: ask the backend for a GitHub
 * authorization URL (POST /auth/github), remember the CSRF `state` it
 * gives us, and send the browser there.
 *
 * The state is round-tripped through GitHub and verified again in
 * `completeGitHubCallback` so a forged callback request can't log an
 * attacker into a victim's browser.
 */
export async function startGitHubLogin(returnTo?: string): Promise<void> {
  const { url, state } = await apiFetch<GitHubAuthorizeResponse>("/auth/github", {
    method: "POST",
  });

  window.sessionStorage.setItem(OAUTH_STATE_STORAGE_KEY, state);
  if (returnTo) {
    window.sessionStorage.setItem(OAUTH_RETURN_TO_STORAGE_KEY, returnTo);
  } else {
    window.sessionStorage.removeItem(OAUTH_RETURN_TO_STORAGE_KEY);
  }

  window.location.assign(url);
}

/** Reads and clears the `returnTo` path saved before redirecting to GitHub. */
export function consumeStoredReturnTo(): string | null {
  const value = window.sessionStorage.getItem(OAUTH_RETURN_TO_STORAGE_KEY);
  window.sessionStorage.removeItem(OAUTH_RETURN_TO_STORAGE_KEY);
  return value;
}

export class OAuthStateMismatchError extends Error {
  constructor() {
    super("The sign-in request could not be verified. Please try again.");
    this.name = "OAuthStateMismatchError";
  }
}

/**
 * Step 2: GitHub redirects the browser back to /auth/callback?code=...&state=...
 * This exchanges that code with the backend (which holds the OAuth client
 * secret — never the frontend) and returns the now-authenticated user.
 */
export async function completeGitHubCallback(
  code: string,
  state: string
): Promise<AuthUser> {
  const expectedState = window.sessionStorage.getItem(OAUTH_STATE_STORAGE_KEY);
  window.sessionStorage.removeItem(OAUTH_STATE_STORAGE_KEY);

  if (!expectedState || expectedState !== state) {
    throw new OAuthStateMismatchError();
  }

  const { user } = await apiFetch<{ user: AuthUser }>("/auth/callback", {
    method: "POST",
    body: { code, state },
  });

  return user;
}

/** GET /auth/me — resolves to the current user, or null if not signed in. */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const { user } = await apiFetch<{ user: AuthUser }>("/auth/me", {
      method: "GET",
    });
    return user;
  } catch (error) {
    return null;
  }
}

/** POST /auth/logout — clears the backend session cookie. */
export async function logoutRequest(): Promise<void> {
  await apiFetch<void>("/auth/logout", { method: "POST" });
}
