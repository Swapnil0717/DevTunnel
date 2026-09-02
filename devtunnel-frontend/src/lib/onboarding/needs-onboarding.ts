import type { AuthUser } from "@/lib/auth/types";

/**
 * Frontend-only "does this person still need to go through onboarding"
 * signal, wiring the onboarding screen (3_devtunnel_onboarding.html) into
 * the sign-in → onboarding → home flow (devtunnel_workflow.txt, Module
 * C1 — Authentication, "User onboarding" screen) without any new backend
 * work — same documented-assumption convention as lib/onboarding/api.ts,
 * since `devtunnel.users` has no `onboarding_completed` column yet
 * (devtunnel-backend/sql/001_create_schema.sql explicitly defers
 * onboarding fields to a later module).
 *
 * `upsertUserFromGitHub` (devtunnel-backend/src/db/users.ts) sets
 * `last_login_at` on *every* GitHub sign-in, including the very first
 * one, while `created_at` is only ever set once, at row creation. That
 * means on a brand-new account the two timestamps land at effectively
 * the same instant; any later sign-in moves `lastLoginAt` forward while
 * `createdAt` stays fixed. So "the two are still (almost) equal" is a
 * true, non-fabricated signal for "this is this person's first sign-in"
 * (Frontend_Development_Rules.txt rule 58: never invent data — this
 * reads only fields the API already returns on `AuthUser`).
 *
 * A small window (rather than exact equality) absorbs the few
 * milliseconds/seconds the two writes take to land in Postgres.
 */
const FIRST_LOGIN_WINDOW_MS = 10_000;

/**
 * Marks "already went through the onboarding wizard this sign-in" once
 * `OnboardingWizard.handleFinish` succeeds. Needed because the timestamp
 * check above can't tell "just finished onboarding a second ago" apart
 * from "still mid–first sign-in" — both have `lastLoginAt` ≈ `createdAt`.
 *
 * Deliberately the same shape as `AUTH_FLAG_COOKIE` in lib/auth/session.ts:
 * a small, non-sensitive, non-`httpOnly` flag cookie, safe to read from
 * both a server component (`next/headers`) and client code
 * (`document.cookie`). It carries no identity data and isn't the security
 * boundary — it only smooths the UX until a real `onboarding_completed`
 * column exists server-side.
 */
export const ONBOARDING_DONE_COOKIE = "dt_onboarding_done";

export function needsOnboarding(user: AuthUser): boolean {
  if (!user.lastLoginAt) return true;

  const createdAt = Date.parse(user.createdAt);
  const lastLoginAt = Date.parse(user.lastLoginAt);

  if (Number.isNaN(createdAt) || Number.isNaN(lastLoginAt)) {
    // Malformed timestamps shouldn't block sign-in entirely — fall back to
    // "already onboarded" rather than trapping the user on /onboarding.
    return false;
  }

  return Math.abs(lastLoginAt - createdAt) <= FIRST_LOGIN_WINDOW_MS;
}