/**
 * Mirrors the frontend-safe subset of `model User` in devtunnel_schema.prisma.
 *
 * Deliberately excludes fields that must never reach the browser, such as
 * `githubId` (internal identifier only used for backend lookups) — see
 * Frontend_Development_Rules.txt rule 17 (public profiles must never expose
 * private/auth data) and rule 20 (API data must be safely rendered).
 */
 import type { DeveloperRole, ExperienceLevel } from "@/lib/onboarding/types";

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
   /**
    * Optional — the same shape submitted by `submitOnboarding()`
    * (lib/onboarding/api.ts). Same documented assumption as that file:
    * `devtunnel.users` doesn't have dedicated columns for these yet
    * (they're called out as "later modules" work in
    * devtunnel-backend/sql/001_create_schema.sql), so `GET /auth/me` may
    * not return them today. Declared optional/nullable and read
    * defensively everywhere (see components/profile/profile-tags.tsx) —
    * never assumed present, never backfilled with placeholder data
    * (Frontend_Development_Rules.txt rule 49 — validate dynamic content;
    * rule 58 — never invent unavailable data).
    */
   developerRole?: DeveloperRole | null;
   experienceLevel?: ExperienceLevel | null;
   skills?: string[];
   technologies?: string[];
 }
 
 export type AuthStatus = "loading" | "authenticated" | "unauthenticated";