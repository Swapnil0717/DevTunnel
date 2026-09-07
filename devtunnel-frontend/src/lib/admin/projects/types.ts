/**
 * Local, frontend-only shapes for the Admin **All Projects** list
 * (admin_workflow.txt, section 4 — "Projects Page").
 *
 * Same convention as `lib/admin/project-onboarding/types.ts`: the backend
 * isn't part of this deliverable, and `GET /admin/projects` doesn't exist
 * yet (only `/admin/auth`, `/admin/activity`, and
 * `/admin/projects/onboarding` are mounted today — see
 * `devtunnel-backend/src/routes/admin/index.ts`). This is a documented
 * assumption built directly from the fields the spec lists for the
 * project table/card (section 4) and the contributor split (section 5),
 * not from an existing schema file.
 */
 import type { OnboardingDescription, OnboardingTechStack } from "../project-onboarding/types";

 /** Minimal GitHub identity for the "Author" column (section 4 / 26). */
 export interface AdminProjectAuthor {
   username: string;
   name: string | null;
   avatarUrl: string | null;
 }
 
 /**
  * "Only include metrics that already exist or can be reliably calculated"
  * (section 3) applies just as much here: a project's lifecycle only ever
  * produces these two states per the onboarding workflow diagram (section
  * 28 — "CREATE PROJECT → ACTIVE PROJECT"). There is no unpublish/archive
  * flow described anywhere in the spec yet, so `ARCHIVED` is kept only as
  * an honest fallback for a value the backend might send that this table
  * doesn't otherwise recognize — never a status this frontend invents on
  * its own for a project.
  */
 export type AdminProjectStatus = "ACTIVE" | "ARCHIVED";
 
 /**
  * A single row of the Projects table (section 4 ▸ Frontend):
  * "Project Name, GitHub Repository, Author, DevTunnel Contributors,
  * GitHub Contributors, Task Count, Status".
  *
  * `devTunnelContributorCount` and `githubContributorCount` are kept as
  * two separate fields rather than one — section 5 is explicit that
  * "GitHub Contributors ≠ DevTunnel Contributors" and "Do not mix the two
  * datasets."
  */
 export interface AdminProjectSummary {
   id: string;
   slug: string;
   name: string;
   repositoryUrl: string;
   repositoryFullName: string;
   author: AdminProjectAuthor;
   devTunnelContributorCount: number;
   githubContributorCount: number;
   taskCount: number;
   status: AdminProjectStatus;
 }
 
 /**
  * `GET /admin/projects/:id` (admin_workflow.txt, section 18 — "Project
  * Detail Page" / A9 in the final page list, section 29; endpoint listed
  * in section 22 — Admin Backend API Map).
  *
  * Extends the list-row summary with exactly the additional fields the
  * detail page needs and nothing invented beyond them: the GitHub
  * repository description and README that Project Onboarding's Step 1
  * import already fetches (`OnboardingRepository.githubDescription` /
  * `.readme` in `lib/admin/project-onboarding/types.ts` — same shape,
  * repeated here because this is a separate, already-published project
  * rather than an in-progress onboarding draft), and the repository's
  * open GitHub issue count (section 26: "GitHub Issues" hang off
  * "Repository", not off the DevTunnel project row itself).
  */
 export interface AdminProjectDetail extends AdminProjectSummary {
   /** GitHub's own repository description, or `null` if GitHub has none set. */
   githubDescription: string | null;
   /** Full README content as imported from the repository's default branch. */
   readme: string | null;
   /** Open issue count on GitHub for this repository (not a DevTunnel task count). */
   openIssuesCount: number;
   /**
    * The Admin's Step 2 choice from Project Onboarding — reusing
    * `OnboardingDescription` rather than a second copy of the same shape,
    * since it's exactly the same "existing vs custom" decision, just read
    * back for an already-published project instead of an in-progress
    * draft. `null` only for a project onboarded before this field existed
    * on the backend — never fabricated as `"EXISTING"` (rule 58: don't
    * invent data this frontend doesn't actually have).
    */
   description: OnboardingDescription | null;
   /**
    * The Admin's Step 3 tech stack from Project Onboarding, editable here
    * the same way it was reviewable/correctable during onboarding —
    * "the Admin should be able to review and correct detected values."
    * `null`, not `EMPTY_TECH_STACK`, when the backend hasn't recorded one
    * yet, so the UI can tell "nothing detected" apart from "not fetched."
    */
   techStack: OnboardingTechStack | null;
 }
 
 /**
  * `PATCH /admin/projects/:id` (admin_workflow.txt section 22 — Admin
  * Backend API Map, "Projects"). Deliberately only the two fields Project
  * Onboarding's Step 2 and Step 3 hand the Admin control over — exactly
  * what the Project Detail page's edit panel lets an Admin change.
  * Everything else on `AdminProjectDetail` (name, repository, author,
  * contributors, issue count, README) is GitHub- or backend-derived and
  * has no writable counterpart here, same restriction the onboarding wizard
  * itself enforces on Step 1's fields ("Admin should not manually enter
  * Author, GitHub username, repository name, contributors, language,
  * stars, forks, issues"). Re-fetching the repository is its own action
  * (`POST /admin/projects/:id/sync`, section 22 ▸ Repository) — not part
  * of this payload.
  */
 export interface AdminProjectUpdatePayload {
   description?: OnboardingDescription;
   techStack?: OnboardingTechStack;
 }