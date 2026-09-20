import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { updateProfile, deleteOwnAccount, DeleteAccountError, toAuthUser } from "../db/users";
import {
  getNotificationPreferences,
  upsertNotificationPreferences,
} from "../db/notificationPreferences";
import { revokeAllSessionsForUser } from "../db/sessions";
import { clearSessionCookies } from "../lib/cookies";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";

export const settings = new Hono<{ Bindings: Env; Variables: Variables }>();

// Every route here requires a signed-in session — the account settings
// page (devtunnel-frontend src/app/(protected)/settings/page.tsx) is
// itself behind the `(protected)` layout, so there is no legitimate
// signed-out caller of any of these (rule 11).
settings.use("*", requireAuth);

/**
 * Validation schema for `PATCH /settings/profile`. `name`/`bio` mirror the
 * limits already used for the same columns elsewhere (onboarding's `bio`
 * cap in routes/auth.ts `onboardingSchema`) — kept in sync rather than
 * inventing a different limit for the same database column. Both are
 * optional/nullable: the settings form lets a user clear either field,
 * and `updateProfile` (db/users.ts) treats an empty string the same as
 * `null`.
 */
const profileUpdateSchema = z.object({
  name: z.string().trim().max(80).nullable().optional().default(null),
  bio: z.string().trim().max(500).nullable().optional().default(null),
});

const notificationPreferencesSchema = z.object({
  issueAssigned: z.boolean(),
  reviewRequested: z.boolean(),
  weeklyDigest: z.boolean(),
});

/**
 * `PATCH /settings/profile` — the "Profile" section of the account
 * settings page. Only touches `name`/`bio`; `email`, `username`, and the
 * GitHub identity fields are read-only on this page (they're sourced from
 * GitHub at sign-in — see db/users.ts `upsertUserFromGitHub`) and are not
 * accepted here even if sent, since the schema above doesn't declare
 * them (rule 15: never trust more from the client than was asked for).
 */
settings.patch("/settings/profile", async (c) => {
  const env = getEnv(c.env);

  const withinLimit = await checkRateLimit(c, { bucket: "settings-profile", limit: 20, windowSeconds: 60 });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, 400, "invalid_json", "Request body must be valid JSON");
  }

  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(c, 422, "validation_error", parsed.error.issues[0]?.message ?? "Invalid profile data");
  }

  const user = c.get("user");
  if (!user) {
    // requireAuth already guarantees this is set — kept for type safety.
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  try {
    const supabase = getSupabase(env);
    const updatedRow = await updateProfile(supabase, user.id, parsed.data);
    return c.json({ user: toAuthUser(updatedRow, user.isMaintainer) }, 200);
  } catch (err) {
    logger.error("profile_update_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Something went wrong");
  }
});

/**
 * `GET /settings/notifications` — loads the toggle states for the
 * "Notifications" section. Returns column defaults (all-on except the
 * digest) when the user has no row yet, so the page never shows an
 * empty/unset state — see db/notificationPreferences.ts.
 */
settings.get("/settings/notifications", async (c) => {
  const env = getEnv(c.env);

  const withinLimit = await checkRateLimit(c, { bucket: "settings-notifications-get", limit: 60, windowSeconds: 60 });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests.");
  }

  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  try {
    const supabase = getSupabase(env);
    const preferences = await getNotificationPreferences(supabase, user.id);
    return c.json({ preferences }, 200);
  } catch (err) {
    logger.error("notification_preferences_load_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Something went wrong");
  }
});

/** `PATCH /settings/notifications` — saves every toggle at once (the
 * settings page's single "Save changes" button, not per-toggle autosave),
 * matching how the mockup's form submits. */
settings.patch("/settings/notifications", async (c) => {
  const env = getEnv(c.env);

  const withinLimit = await checkRateLimit(c, { bucket: "settings-notifications-patch", limit: 20, windowSeconds: 60 });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return errorResponse(c, 400, "invalid_json", "Request body must be valid JSON");
  }

  const parsed = notificationPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      c,
      422,
      "validation_error",
      parsed.error.issues[0]?.message ?? "Invalid notification preferences",
    );
  }

  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  try {
    const supabase = getSupabase(env);
    const preferences = await upsertNotificationPreferences(supabase, user.id, parsed.data);
    return c.json({ preferences }, 200);
  } catch (err) {
    logger.error("notification_preferences_update_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Something went wrong");
  }
});

/**
 * `DELETE /settings/account` — the "Danger zone" action. Soft-deletes the
 * row (db/users.ts `deleteOwnAccount`, sql/035's `delete_own_account`),
 * then immediately revokes every session for this user and clears this
 * browser's cookies, so the request that triggered the deletion is also
 * the last authenticated thing this session ever does.
 *
 * The frontend is responsible for a confirmation step before calling this
 * — the mockup's "Delete account" button opens a confirm dialog first
 * (Frontend_Development_Rules.txt rule 24: destructive actions need
 * confirmation); this route does not re-prompt, it just executes.
 */
settings.delete("/settings/account", async (c) => {
  const env = getEnv(c.env);

  const withinLimit = await checkRateLimit(c, { bucket: "settings-delete-account", limit: 5, windowSeconds: 60 });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  try {
    const supabase = getSupabase(env);
    await deleteOwnAccount(supabase, user.id);
    await revokeAllSessionsForUser(supabase, user.id);
    clearSessionCookies(c, env);
    return c.json({ success: true }, 200);
  } catch (err) {
    if (err instanceof DeleteAccountError) {
      const status = err.code === "not_found" ? 404 : 409;
      return errorResponse(c, status, err.code, err.message);
    }
    logger.error("account_delete_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Something went wrong");
  }
});