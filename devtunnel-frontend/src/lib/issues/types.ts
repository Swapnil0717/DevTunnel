/**
 * Local, frontend-only shapes for the contributor-facing **All Issues**
 * page (`/issues` — "All Issues" in `AppSidebar` / `AppBottomNav`).
 *
 * Mirrors `AdminNewIssue` (`lib/admin/new-issues/types.ts`) — same
 * underlying GitHub object, just the contributor's read-only view of it:
 * no DevTunnel-side `id` for a "this is new" curation record (nothing
 * here gets ignored/converted the way an Admin can from
 * `/admin/tasks/new-issues`), and no `onboardedAt` (a contributor
 * browsing issues has no use for when the project itself was onboarded).
 *
 * `OnboardingGithubIdentity` is reused as a type-only import rather than
 * redeclared — it's the same GitHub author shape on both sides of the
 * app, and a type-only import is erased at build time, so this carries
 * no runtime coupling to the admin bundle.
 */
 import type { OnboardingGithubIdentity } from "@/lib/admin/project-onboarding/types";

 export type IssueState = "OPEN" | "CLOSED";
 
 /**
  * The project an issue's repository belongs to, trimmed to what the
  * table and filter bar need — same fields `AdminNewIssueProjectRef`
  * carries, minus `id`/`onboardedAt` (not needed on this read-only view).
  */
 export interface IssueProjectRef {
   slug: string;
   name: string;
   repositoryFullName: string;
   repositoryUrl: string;
   techStack: string[];
 }
 
 /**
  * A single row of the All Issues table: Issue #, Issue Title, Project,
  * GitHub Author, Labels, Created, Updated — same columns
  * `AdminNewIssuesTable` renders, just without the admin curation
  * actions.
  *
  * `state` is kept for the same reason `AdminNewIssue.state` is: an issue
  * can be closed on GitHub before a contributor gets to it, and hiding
  * that would let someone start work on something no longer actionable.
  */
 export interface Issue {
   number: number;
   title: string;
   url: string;
   state: IssueState;
   project: IssueProjectRef;
   /** The GitHub user who opened the issue. */
   author: OnboardingGithubIdentity;
   labels: string[];
   createdAt: string;
   updatedAt: string;
 }