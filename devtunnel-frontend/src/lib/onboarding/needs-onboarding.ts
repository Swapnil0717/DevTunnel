import type { AuthUser } from "@/lib/auth/types";

/**
 * Single source of truth for "does this person still need to go through
 * onboarding" (devtunnel_workflow.txt, Module C1 — Authentication, "User
 * onboarding" screen).
 *
 * Backed entirely by `AuthUser.onboardingCompleted`, which mirrors
 * `devtunnel.users.onboarding_completed`
 * (devtunnel-backend/sql/002_add_onboarding_fields.sql) and is only ever
 * flipped to `true` server-side, by `PATCH /auth/onboarding`
 * (devtunnel-backend/src/db/users.ts, `completeOnboarding`).
 *
 * This deliberately does NOT use `createdAt`/`lastLoginAt` proximity or a
 * client-set cookie as a stand-in. Both of those only describe "was this
 * the user's first sign-in a moment ago" — they say nothing about whether
 * the wizard was actually finished, so a user who signs in, then closes
 * the tab mid-onboarding, and comes back later (a real, later sign-in)
 * would read as "already onboarded" even though they never completed it.
 * The `onboarding_completed` column persists across sign-ins, so this
 * check keeps working correctly no matter how much time has passed.
 */
export function needsOnboarding(user: AuthUser): boolean {
  return !user.onboardingCompleted;
}