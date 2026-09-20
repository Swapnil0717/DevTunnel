import { API_BASE_URL } from "@/lib/config";
import { parseAuthMeResponse } from "@/lib/auth/api";
import type { AuthUser } from "@/lib/auth/types";
import type { NotificationPreferences, ProfileUpdateData } from "./types";

export class SettingsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SettingsApiError";
    this.status = status;
  }
}

/**
 * `PATCH /settings/profile` — saves the "Profile" section (name + bio).
 * Returns the updated `AuthUser` so the caller can push it straight into
 * `AuthProvider` (via `refreshUser`, same as every other auth-mutating
 * call in this app) instead of re-fetching `GET /auth/me` right after.
 */
export async function updateProfile(data: ProfileUpdateData): Promise<AuthUser | null> {
  const res = await fetch(`${API_BASE_URL}/settings/profile`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new SettingsApiError(`Failed to save profile (${res.status})`, res.status);
  }

  return parseAuthMeResponse(await res.json());
}

/**
 * `GET /settings/notifications`. The backend returns sensible defaults
 * when the user has no saved preferences yet (see
 * devtunnel-backend/src/db/notificationPreferences.ts), so this never
 * needs its own "not found" handling.
 */
export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const res = await fetch(`${API_BASE_URL}/settings/notifications`, {
    credentials: "include",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new SettingsApiError(`Failed to load notification preferences (${res.status})`, res.status);
  }

  const payload = (await res.json()) as { preferences: NotificationPreferences };
  return payload.preferences;
}

/** `PATCH /settings/notifications` — saves every toggle at once. */
export async function updateNotificationPreferences(
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  const res = await fetch(`${API_BASE_URL}/settings/notifications`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preferences),
  });

  if (!res.ok) {
    throw new SettingsApiError(`Failed to save notification preferences (${res.status})`, res.status);
  }

  const payload = (await res.json()) as { preferences: NotificationPreferences };
  return payload.preferences;
}

/**
 * `DELETE /settings/account` — the "Danger zone" action. The backend
 * soft-deletes the row and revokes every session for this user
 * (devtunnel-backend/src/routes/settings.ts), so the caller only needs to
 * clear its own local auth state and redirect — same shape as `logout()`
 * in lib/auth/api.ts.
 */
export async function deleteAccount(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/settings/account`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!res.ok) {
    throw new SettingsApiError(`Failed to delete account (${res.status})`, res.status);
  }
}
