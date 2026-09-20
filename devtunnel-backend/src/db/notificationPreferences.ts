import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationPreferences, NotificationPreferencesRow } from "../types";

/** Column defaults from sql/035_add_settings.sql — kept in one place so a
 * user with no row yet (see `getNotificationPreferences` below) sees
 * exactly what a freshly-inserted row would contain. */
const DEFAULT_PREFERENCES: NotificationPreferences = {
  issueAssigned: true,
  reviewRequested: true,
  weeklyDigest: false,
};

function toNotificationPreferences(row: NotificationPreferencesRow): NotificationPreferences {
  return {
    issueAssigned: row.issue_assigned,
    reviewRequested: row.review_requested,
    weeklyDigest: row.weekly_digest,
  };
}

/**
 * Reads a user's notification preferences, falling back to the column
 * defaults when no row exists yet. A row is only ever created on first
 * `PATCH /settings/notifications` (see `upsertNotificationPreferences`
 * below) — every existing account otherwise gets the same defaults it
 * would have gotten if sql/035 had shipped with them pre-seeded, without
 * an actual backfill migration.
 */
export async function getNotificationPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select()
    .eq("user_id", userId)
    .maybeSingle<NotificationPreferencesRow>();

  if (error) {
    throw new Error(`Failed to load notification preferences: ${error.message}`);
  }

  return data ? toNotificationPreferences(data) : DEFAULT_PREFERENCES;
}

/**
 * Creates or updates a user's notification preferences row. `userId`
 * comes exclusively from `requireAuth` in the caller
 * (routes/settings.ts) — never from the request body — so a signed-in
 * user can only ever write their own row (rule 12).
 */
export async function upsertNotificationPreferences(
  supabase: SupabaseClient,
  userId: string,
  preferences: NotificationPreferences,
): Promise<NotificationPreferences> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .upsert(
      {
        user_id: userId,
        issue_assigned: preferences.issueAssigned,
        review_requested: preferences.reviewRequested,
        weekly_digest: preferences.weeklyDigest,
      },
      { onConflict: "user_id" },
    )
    .select()
    .single<NotificationPreferencesRow>();

  if (error || !data) {
    throw new Error(`Failed to save notification preferences: ${error?.message ?? "no row returned"}`);
  }

  return toNotificationPreferences(data);
}