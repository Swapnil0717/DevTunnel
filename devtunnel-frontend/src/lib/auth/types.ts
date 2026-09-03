/**
 * Mirrors the frontend-safe subset of `model User` in devtunnel_schema.prisma.
 *
 * Deliberately excludes fields that must never reach the browser, such as
 * `githubId` (internal identifier only used for backend lookups) — see
 * Frontend_Development_Rules.txt rule 17 (public profiles must never expose
 * private/auth data) and rule 20 (API data must be safely rendered).
 */
 import type { ContributorIntent, DeveloperRole, ExperienceLevel } from "@/lib/onboarding/types";

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
    * The same fields submitted by `submitOnboarding()`
    * (lib/onboarding/api.ts), now returned by both `GET /auth/me` and
    * `PATCH /auth/onboarding` (devtunnel-backend/src/db/users.ts
    * `toAuthUser`) — every field asked for during onboarding is present
    * here so the profile page can render all of it
    * (components/profile/profile-tags.tsx), not just a subset. Arrays
    * default to `[]` and enum fields to `null` server-side before
    * onboarding is completed — never assume a non-empty value, never
    * backfill with placeholder data (Frontend_Development_Rules.txt rule
    * 49 — validate dynamic content; rule 58 — never invent unavailable
    * data).
    */
   skills: string[];
   technologies: string[];
   developerRole: DeveloperRole | null;
   experienceLevel: ExperienceLevel | null;
   interests: string[];
   intent: ContributorIntent | null;
   /**
    * Whether this user maintains at least one DevTunnel project
    * (devtunnel.project_maintainers —
    * devtunnel-backend/src/db/devtunnelStats.ts `getIsMaintainer`). This
    * is independent of `role` — a `CONTRIBUTOR`-role account can still be
    * a maintainer of a specific project, so the profile page shows both
    * badges when both are true (components/profile/profile-tags.tsx)
    * rather than treating maintainer status as a single account-wide
    * role.
    */
   isMaintainer: boolean;
 }
 
 export type AuthStatus = "loading" | "authenticated" | "unauthenticated";