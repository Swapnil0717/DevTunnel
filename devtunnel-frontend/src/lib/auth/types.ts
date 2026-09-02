/**
 * Mirrors the frontend-safe subset of `model User` in devtunnel_schema.prisma.
 *
 * Deliberately excludes fields that must never reach the browser, such as
 * `githubId` (internal identifier only used for backend lookups) — see
 * Frontend_Development_Rules.txt rule 17 (public profiles must never expose
 * private/auth data) and rule 20 (API data must be safely rendered).
 */
 export type UserRole = "CONTRIBUTOR" | "MAINTAINER" | "ADMIN";

 export interface AuthUser {
   id: string;
   email: string;
   username: string;
   name: string | null;
   bio: string | null;
   avatarUrl: string | null;
   githubUsername: string | null;
   githubProfileUrl: string | null;
   role: UserRole;
   createdAt: string;
   lastLoginAt: string | null;
   /**
    * Backend-authoritative "has this person finished the onboarding
    * wizard" flag — `devtunnel.users.onboarding_completed`
    * (devtunnel-backend/sql/002_add_onboarding_fields.sql), set to `true`
    * by `PATCH /auth/onboarding` (devtunnel-backend/src/db/users.ts,
    * `completeOnboarding`). This is the single source of truth consumed
    * by `lib/onboarding/needs-onboarding.ts` — never re-derive this from
    * timestamps or cookies on the frontend.
    */
   onboardingCompleted: boolean;
 }
 
 export type AuthStatus = "loading" | "authenticated" | "unauthenticated";