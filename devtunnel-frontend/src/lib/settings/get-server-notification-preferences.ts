import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { NotificationPreferences } from "./types";

/** Same column defaults db/notificationPreferences.ts falls back to — kept
 * here too so a failed fetch still renders the toggles in a sensible
 * state instead of all-off. */
const DEFAULT_PREFERENCES: NotificationPreferences = {
  issueAssigned: true,
  reviewRequested: true,
  weeklyDigest: false,
};

/**
 * Server-side `GET /settings/notifications`, forwarding the incoming
 * request's cookies — used by `settings/page.tsx` so the notification
 * toggles render with real saved values on first paint, no client-side
 * loading flash. Same pattern as `lib/profile/get-server-devtunnel-stats.ts`.
 *
 * Falls back to the column defaults on any failure, rather than `null` —
 * the settings form always needs *some* starting values for its toggles,
 * and those defaults are exactly what a user with no saved row yet would
 * see from a successful call anyway.
 */
export async function getServerNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const res = await fetch(`${API_BASE_URL}/settings/notifications`, {
      headers: { cookie: (await cookies()).toString() },
      cache: "no-store",
    });

    if (!res.ok) return DEFAULT_PREFERENCES;

    const body = (await res.json()) as { preferences?: NotificationPreferences };
    return body.preferences ?? DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}
