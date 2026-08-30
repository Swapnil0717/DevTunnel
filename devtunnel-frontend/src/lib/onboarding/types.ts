/**
 * Local, frontend-only shape for the onboarding form
 * (devtunnel_workflow.txt, Module C1 — Authentication: "User onboarding"
 * screen; 3_devtunnel_onboarding.html).
 *
 * Assumption (documented because the backend isn't part of this
 * deliverable, same convention as lib/auth/types.ts): `devtunnel.users`
 * currently only has the auth columns defined in
 * devtunnel-backend/sql/001_create_schema.sql, which explicitly calls out
 * skills/technologies/interests/etc. as "later modules" work. This file
 * does not assume those columns already exist server-side — see
 * lib/onboarding/api.ts for how submission is handled in the meantime.
 */
 export type DeveloperRole = "FRONTEND" | "BACKEND" | "FULL_STACK";

 export type ExperienceLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
 
 /**
  * Mirrors the two contributor entry points from the Contributor Home
  * Module (devtunnel_workflow.txt, Module 3: "Start an Open Source
  * Project" / "Find an Open Source Project").
  */
 export type ContributorIntent = "START_PROJECT" | "FIND_PROJECT";
 
 export interface OnboardingData {
   bio: string;
   skills: string[];
   technologies: string[];
   developerRole: DeveloperRole | null;
   experienceLevel: ExperienceLevel | null;
   interests: string[];
   intent: ContributorIntent | null;
 }
 
 export const EMPTY_ONBOARDING_DATA: OnboardingData = {
   bio: "",
   skills: [],
   technologies: [],
   developerRole: null,
   experienceLevel: null,
   interests: [],
   intent: null,
 };
 
 export const DEVELOPER_ROLE_LABEL: Record<DeveloperRole, string> = {
   FRONTEND: "Frontend developer",
   BACKEND: "Backend developer",
   FULL_STACK: "Full stack developer",
 };
 
 export const EXPERIENCE_LEVEL_LABEL: Record<ExperienceLevel, string> = {
   BEGINNER: "Beginner",
   INTERMEDIATE: "Intermediate",
   ADVANCED: "Advanced",
 };
 
 export const CONTRIBUTOR_INTENT_LABEL: Record<ContributorIntent, string> = {
   START_PROJECT: "Start an open source project",
   FIND_PROJECT: "Find an open source project",
 };
 