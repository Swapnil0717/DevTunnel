/**
 * Local, frontend-only shapes for the contributor-facing **View Project**
 * page (`/projects/:projectSlug`) — the destination
 * `DevtunnelProjectCard` (`components/projects/devtunnel-project-card.tsx`)
 * and `ProjectCard` (`components/home/project-card.tsx`) have both linked
 * to since `/projects` shipped, but which had no route of its own yet.
 *
 * Distinct from `GithubProjectDetail` (`lib/github-projects/types.ts`):
 * that describes a raw GitHub repository DevTunnel has *not* onboarded —
 * pure GitHub metadata, with GitHub's own issue list as the only thing to
 * act on. This describes a project DevTunnel *has* onboarded, so it also
 * carries the two things that only exist on this side of the app:
 * DevTunnel `tasks` (curated, role/difficulty-tagged work items) and a
 * DevTunnel contributor count kept strictly separate from the GitHub one
 * (admin_workflow.txt section 5: "GitHub Contributors ≠ DevTunnel
 * Contributors — do not mix the two datasets").
 *
 * `Task` and `Issue` are reused verbatim from `lib/tasks/types.ts` and
 * `lib/issues/types.ts` rather than redeclared in trimmed form: the Tasks
 * and All Issues tabs on this page show the same rows `/tasks` and
 * `/issues` already show, just scoped to one project, so a second, nearly
 * identical shape would only let the two drift apart
 * (Frontend_Development_Rules.txt rule 51).
 *
 * Not confirmed against the backend yet — same documented-assumption
 * convention `lib/github-projects/types.ts` and `lib/issues/types.ts`
 * already follow (rule 58: don't invent data, but a plausible,
 * clearly-flagged shape is fine while the backend catches up).
 * TODO: confirm `GET /projects/:slug` and its payload with backend.
 */
 import type { OnboardingGithubIdentity } from "@/lib/admin/project-onboarding/types";
 import type { AdminProjectStatus } from "@/lib/admin/projects/types";
 import type { Task, TaskProgressCounts } from "@/lib/tasks/types";
 import type { Issue } from "@/lib/issues/types";
 
 /**
  * `GET /projects/:slug` response.
  *
  * Every field here is either already carried by a shape this app fetches
  * elsewhere (`ProjectSummary`, `AdminProjectDetail`,
  * `GithubProjectDetail`) or is the per-viewer state the page's own two
  * actions need (`isStarredByViewer`, `viewerIsContributing`). Nothing is
  * a new, invented statistic (rules 38/58).
  */
 export interface DevtunnelProjectDetail {
   id: string;
   slug: string;
   name: string;
   /** DevTunnel's curated description, or GitHub's if none was written. `null` when neither exists. */
   description: string | null;
   repositoryUrl: string;
   repositoryFullName: string;
   /** Repository author/maintainer on GitHub — same identity shape the rest of the app uses. */
   author: OnboardingGithubIdentity;
   /** The single headline technology, same field `ProjectSummary.primaryTech` already carries. */
   primaryTech: string | null;
   /** Flat tag list for display — same "one flat list" convention `IssueProjectRef.techStack` uses. */
   techStack: string[];
   /** SPDX-style license name (e.g. "MIT"), or `null` if GitHub reports none. */
   license: string | null;
   /** Raw README markdown from the repository's default branch, or `null` if there is none. */
   readme: string | null;
   status: AdminProjectStatus;
 
   /** GitHub's own public star count — never DevTunnel's local one (`localStarCount`). */
   stars: number;
   forks: number;
   /** Open issues on GitHub for this repository — not a DevTunnel task count. */
   openIssuesCount: number;
   /** Contributors on GitHub. Kept separate from `devTunnelContributorCount` on purpose. */
   githubContributorCount: number;
   /** Contributors working through DevTunnel. Kept separate from `githubContributorCount` on purpose. */
   devTunnelContributorCount: number;
   /** Total DevTunnel tasks on this project, including ones already done. */
   taskCount: number;
   /**
    * Tasks per stage (open / in progress / in review / done), counted in
    * the database so `total` matches `taskCount`. `null` when the backend's
    * count failed; absent when the frontend is ahead of the backend —
    * either way the progress bar is simply not shown.
    */
   taskProgress?: TaskProgressCounts | null;
 
   /** GitHub repository creation date. */
   createdAt: string;
   /** Last GitHub push/activity. */
   pushedAt: string;
 
   /**
    * Whether the signed-in contributor has starred this project through
    * DevTunnel, and how many contributors have — same pair, and the same
    * meaning, as `GithubProjectDetail.isStarredByViewer` /
    * `.localStarCount`. Computed fresh per viewer, never cached with the
    * rest of this payload.
    */
   isStarredByViewer: boolean;
   localStarCount: number;
 
   /**
    * Whether the signed-in contributor has already joined this project
    * ("Contribute to this project"). Drives the header button's joined
    * state so a returning contributor isn't invited to join something
    * they're already part of.
    */
   viewerIsContributing: boolean;
 
   /**
    * Profile-match signal, same optional pair `ProjectSummary` carries for
    * the cards on `/projects` and `/home`. Optional because a project only
    * has one once the contributor has finished onboarding — absent, not
    * zero, when there's nothing to compare against.
    */
   matchPercent?: number;
   matchRole?: string;
 
   /** DevTunnel tasks on this project — the "Tasks" tab. */
   tasks: Task[];
   /** Open and recently-closed GitHub issues on this repository — the "All Issues" tab. */
   issues: Issue[];
 }