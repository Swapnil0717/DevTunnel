import { API_BASE_URL } from "@/lib/config";
import type { AuthUser } from "./types";

export class AuthApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

/**
 * `GET /auth/me` (devtunnel_workflow.txt, Module C1 — Authentication).
 *
 * Returns the authenticated user, or `null` when there is no valid session
 * (a 401 is the expected, non-error response for a signed-out visitor —
 * it is not thrown as an exception).
 */
export async function fetchCurrentUser(
  init?: RequestInit,
): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    credentials: "include",
    cache: "no-store",
    ...init,
  });

  if (res.status === 401) {
    return null;
  }

  if (!res.ok) {
    throw new AuthApiError(`Failed to load the current user (${res.status})`, res.status);
  }

  const data = (await res.json()) as { user?: AuthUser } | AuthUser;
  return "user" in data ? (data.user ?? null) : data;
}

/**
 * `POST /auth/logout` (devtunnel_workflow.txt, Module C1 — Authentication).
 *
 * Clears the session on the backend. The caller is responsible for
 * clearing local UI state afterwards (see `AuthProvider.logout`).
 */
export async function logout(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok && res.status !== 401) {
    throw new AuthApiError(`Logout failed (${res.status})`, res.status);
  }
}

/**
 * URL the "Continue with GitHub" form posts to. Kept as a function (rather
 * than a bare constant) so every call site is explicit about the fact that
 * this triggers `POST /auth/github`, which the backend answers with a
 * redirect into GitHub's OAuth authorize screen.
 */
export function githubLoginActionUrl(): string {
  return `${API_BASE_URL}/auth/github`;
}
