/**
 * Local, frontend-only shapes for the contributor-facing **GitHub
 * Projects** page (`/github-projects` — "GitHub Projects" in
 * `AppSidebar`).
 *
 * Distinct from `AdminProjectSummary` (`lib/admin/projects/types.ts`,
 * the curated "Projects on DevTunnel" list with DevTunnel-side tasks
 * and contributor counts): this is the read-only, GitHub-repository-
 * centric catalog — the raw GitHub metadata (stars, forks, license,
 * topics, activity) admin_workflow.txt sections 35/37 list a repository
 * as carrying, trimmed to what a contributor deciding which project to
 * explore next actually needs. No DevTunnel task/contributor counts
 * here — that's `AdminProjectSummary`'s job, not this page's.
 *
 * Not confirmed against the backend yet — same documented-assumption
 * convention as `lib/issues/types.ts` (Frontend_Development_Rules.txt
 * rule 58: don't invent data, but a plausible, clearly-flagged shape is
 * fine while the backend catches up).
 *
 * `OnboardingGithubIdentity` is reused as a type-only import rather than
 * redeclared — same "one GitHub author shape shared on both sides of
 * the app" convention `lib/issues/types.ts` documents. A type-only
 * import is erased at build time, so this carries no runtime coupling
 * to the admin bundle.
 */
 import type { OnboardingGithubIdentity } from "@/lib/admin/project-onboarding/types";

 /**
  * A single card on the `/github-projects` grid. `techStack` is a flat
  * tag list rather than the full categorized `OnboardingTechStack` —
  * same "one flat list for search/filter" convention `IssueProjectRef`
  * documents, since this page only ever filters/searches by tag, never
  * needs to know which category a tag belongs to.
  */
 export interface GithubProjectSummary {
   id: string;
   slug: string;
   name: string;
   /** GitHub's own repository description, or `null` if GitHub has none set. */
   description: string | null;
   repositoryUrl: string;
   repositoryFullName: string;
   owner: OnboardingGithubIdentity;
   primaryLanguage: string | null;
   techStack: string[];
   /** SPDX-style license name (e.g. "MIT"), or `null` if GitHub reports none. */
   license: string | null;
   stars: number;
   forks: number;
   openIssuesCount: number;
   contributorCount: number;
   /** GitHub repository creation date — powers the "Newest" sort. */
   createdAt: string;
   /** Last GitHub push/activity — powers "Trending" and "Recently updated". */
   pushedAt: string;
 }
 
 /**
  * One row in the Project Detail page's Issues tab — a lightweight,
  * read-only preview of a single open GitHub issue on the repository.
  * Deliberately thin (no body, no comments) — same "list view only needs
  * enough to link out" posture `IssuesTable`'s row shape already takes
  * for `/issues`; a contributor who wants the full issue opens it on
  * GitHub itself via `url` rather than reading it rendered here.
  */
 export interface GithubProjectIssuePreview {
   id: string;
   number: number;
   title: string;
   url: string;
   /** Issue labels as GitHub reports them — flat list, no color/category metadata. */
   labels: string[];
   commentCount: number;
   createdAt: string;
 }
 
 /**
  * `GET /github-projects/:slug` response — everything `GithubProjectSummary`
  * already carries, plus what only the single-project detail view needs:
  * the repository's own README (rendered with `MarkdownReadme`, same
  * component the onboarding flow and Admin Project Detail already use)
  * and a page of its currently-open issues. Extends rather than
  * duplicates `GithubProjectSummary` — same "detail = summary + more"
  * shape `TaskDetail` takes over `Task` in `lib/tasks/types.ts`, so the
  * grid card and the detail header never drift into two different ideas
  * of what a project's core fields are.
  */
 export interface GithubProjectDetail extends GithubProjectSummary {
   /** Raw README markdown from the repository's default branch, or `null` if GitHub has none. */
   readme: string | null;
   /**
    * A page of the repository's currently-open issues, newest first.
    * Not the full issue tracker — GitHub's own issue list is the source
    * of truth for anything beyond this preview, which is why every row
    * also carries its own `url`.
    */
   openIssues: GithubProjectIssuePreview[];
   /**
    * Whether the signed-in contributor has starred this repository
    * *through DevTunnel* (`StarButton`,
    * `components/github-projects/star-button.tsx` /
    * `components/github-open-source-tools/star-button.tsx`) — backed by
    * devtunnel-backend's own `github_stars` table, not GitHub's public
    * star count (that's `stars`, above, straight from GitHub). Starring
    * through DevTunnel also stars the repository on the contributor's
    * real GitHub account (`PUT /github-projects/:slug/star` /
    * `PUT /github-open-source-tools/:slug/star`,
    * src/routes/githubProjects.ts / src/routes/githubOpenSourceTools.ts)
    * — this flag is just DevTunnel's own record of that, computed fresh
    * per viewer on every request (never cached alongside the rest of
    * this payload, since it's specific to whoever is looking).
    */
   isStarredByViewer: boolean;
   /**
    * How many DevTunnel contributors have starred this repository
    * through DevTunnel — a DevTunnel-local count, not GitHub's own
    * public star count (`stars`, above). Shown next to the Star button
    * as a lightweight "contributors here like this too" signal.
    */
   localStarCount: number;
 }