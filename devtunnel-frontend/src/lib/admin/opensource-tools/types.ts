/**
 * Local, frontend-only shapes for the Admin **All Open Source Tools**
 * list and detail view (`/admin/opensource-tools`, `/admin/opensource-tools/:id`
 * — "All Open Source Tools" in `admin-nav-items.ts`).
 *
 * There's no Admin Portal Master Coding Specification module for this
 * screen — same as `lib/admin/opensource-tool-onboarding/types.ts`, which
 * this file reuses fields from directly rather than re-declaring them.
 * `GET /admin/opensource-tools` and `GET /admin/opensource-tools/:id`
 * don't exist on the backend yet (only the six onboarding-wizard routes
 * are mounted — see `routes/admin/index.ts`'s own comment: "there is no
 * plain `/admin/opensource-tools` sibling yet"), so every field here is
 * taken directly from the published `devtunnel.opensource_tools` table
 * (sql/017) rather than invented (Frontend_Development_Rules.txt rule
 * 58) — same documented-assumption convention `projects/types.ts` uses.
 */
 import type { ToolDescriptionChoice } from "../opensource-tool-onboarding/types";

 /**
  * A single card on the `/admin/opensource-tools` grid. Fields map 1:1 to
  * `devtunnel.opensource_tools` columns (sql/017) — `sourceUrl`,
  * `fetchedDescription` and `primaryLanguage` are exactly what Step 1 of
  * onboarding resolved, `labels` is Step 3's flat string list. There is
  * no `logoUrl` column on that table, so the card derives a logo from
  * `sourceUrl`'s domain (`OpenSourceToolLogo`) instead of fabricating one
  * here.
  */
 export interface AdminToolSummary {
   id: string;
   slug: string;
   name: string;
   sourceUrl: string;
   fetchedDescription: string | null;
   primaryLanguage: string | null;
   labels: string[];
   createdAt: string;
 }
 
 /**
  * `GET /admin/opensource-tools/:id`. Extends the grid summary with the
  * remaining onboarding-authored fields the detail page shows/edits:
  * the Step 2 description choice, the Step 4 setup guide, and the
  * imported README (never edited here — same "repository fields locked"
  * restriction `EditProjectDetailsPanel` documents for GitHub-derived
  * project fields).
  */
 export interface AdminToolDetail extends AdminToolSummary {
   readme: string | null;
   descriptionChoice: ToolDescriptionChoice;
   customDescription: string | null;
   setupGuide: string;
 }
 
 /**
  * `PATCH /admin/opensource-tools/:id`. Deliberately only the fields an
  * Admin can still change after publishing — description, labels, setup
  * guide — the same restriction Steps 2–4 of onboarding hand the Admin
  * and nothing more. `sourceUrl`, `fetchedDescription`, `primaryLanguage`
  * and `readme` stay exactly what onboarding's Step 1 import resolved,
  * mirroring how `AdminProjectUpdatePayload` locks out GitHub-derived
  * project fields.
  */
 export interface AdminToolUpdatePayload {
   descriptionChoice?: ToolDescriptionChoice;
   customDescription?: string | null;
   labels?: string[];
   setupGuide?: string;
 }
 