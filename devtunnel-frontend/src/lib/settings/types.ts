/**
 * Local, frontend-only shapes for the account settings page
 * (app/(protected)/settings/page.tsx). Mirrors
 * devtunnel-backend/src/types.ts `ProfileUpdateData` /
 * `NotificationPreferences` — same "assumption documented, kept in sync"
 * convention as lib/onboarding/types.ts.
 */

/** Body of `PATCH /settings/profile`. */
export interface ProfileUpdateData {
  name: string | null;
  bio: string | null;
}

/**
 * The toggle states shown in the "Notifications" section. Field names
 * match the backend's `notification_preferences` columns 1:1 (camelCase
 * vs snake_case) — see devtunnel-backend/sql/035_add_settings.sql.
 */
export interface NotificationPreferences {
  /** New issue assigned to this contributor by a maintainer. */
  issueAssigned: boolean;
  /** Someone requests this contributor's review on a pull request. */
  reviewRequested: boolean;
  /** Weekly summary of new projects and open tasks. Off by default. */
  weeklyDigest: boolean;
}
