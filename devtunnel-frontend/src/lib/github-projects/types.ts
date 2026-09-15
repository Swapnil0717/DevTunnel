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