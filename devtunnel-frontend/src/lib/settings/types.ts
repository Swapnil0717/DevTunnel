/**
 * Local, frontend-only shapes for the account settings page
 * (app/(protected)/settings/page.tsx). Mirrors
 * devtunnel-backend/src/types.ts `ProfileUpdateData` / `SkillsUpdateData` /
 * `NotificationPreferences` — same "assumption documented, kept in sync"
 * convention as lib/onboarding/types.ts.
 */
 import type { DeveloperRole, ExperienceLevel } from "@/lib/onboarding/types";

 /** Body of `PATCH /settings/profile`. */
 export interface ProfileUpdateData {
   name: string | null;
   bio: string | null;
 }
 
 /**
  * Body of `PATCH /settings/skills` — the "Skills and background" section.
  * Same fields onboarding's `ProfileStep` collects (lib/onboarding/types.ts
  * `OnboardingData`, minus `bio`/`intent`, which live elsewhere), so a
  * contributor can update how they're matched to projects any time, not
  * just once during onboarding.
  */
 export interface SkillsUpdateData {
   skills: string[];
   technologies: string[];
   developerRoles: DeveloperRole[];
   experienceLevel: ExperienceLevel;
   interests: string[];
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