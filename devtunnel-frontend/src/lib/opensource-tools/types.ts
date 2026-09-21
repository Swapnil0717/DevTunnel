import type { OnboardingGithubIdentity } from "@/lib/admin/project-onboarding/types";
import type { GithubProjectIssuePreview } from "@/lib/github-projects/types";
import type { Task } from "@/lib/tasks/types";

/**
 * Local, frontend-only shape for the contributor-facing **Open Source
 * Tools on Devtunnel** page (`/opensource-tools` — "Open Source Tools on
 * Devtunnel" in `AppSidebar`).
 *
 * Distinct from `AdminToolSummary` (`lib/admin/opensource-tools/types.ts`,
 * the Admin's own grid with View/Edit/Delete actions): this is the
 * read-only, contributor-facing shape — the fields a contributor
 * deciding whether a tool is worth using actually needs, trimmed of
 * anything admin-only (`id`-as-primary-key aside, there's no edit
 * affordance, no `descriptionChoice`/`setupGuide` here). Same
 * relationship `ProjectSummary` (`lib/home/types.ts`) has to
 * `AdminProjectSummary`.
 *
 * `GET /opensource-tools/available` is NOT confirmed anywhere —
 * `docs/devtunnel-workflow.md` only spec's `GET /projects/available` and
 * `GET /contributor/tasks` for contributor-facing catalogs (Module 3).
 * Same documented-assumption convention `lib/home/api.ts` used for
 * Home's endpoints before they were built: a plausible, clearly-flagged
 * shape built directly from the published `devtunnel.opensource_tools`
 * columns (sql/017) rather than invented from nothing
 * (Frontend_Development_Rules.txt rule 58), but not yet backed by a real
 * spec'd route — get it confirmed with backend before relying on it.
 */
 export interface OpenSourceToolSummary {
    id: string;
    slug: string;
    name: string;
    /** Resolved description (custom, falling back to the fetched repo description) — or `null` if neither exists yet. */
    description: string | null;
    sourceUrl: string;
    primaryLanguage: string | null;
    /** Step 3 of onboarding — roles/fields this tool is relevant to (sql/017 `labels`). */
    labels: string[];
    createdAt: string;
  }

/**
 * The tool's underlying GitHub repository, when it has one.
 *
 * Nullable on purpose, and this is the field that makes the Tool Detail
 * page differ from the Project Detail page rather than being a copy of
 * it: `devtunnel.opensource_tools` (sql/017) stores a `source_url`, not a
 * repository — a tool's source can perfectly well be a docs site, a
 * vendor page, or a self-hosted Git instance. Everything GitHub-shaped
 * (stars, forks, issues, license, maintainer) therefore hangs off this
 * object instead of sitting on the tool itself, so the page can hide
 * that whole block honestly when there's no repository behind the tool,
 * rather than rendering a row of zeroes that look like real counts
 * (Frontend_Development_Rules.txt rules 38/58).
 *
 * Fields mirror `GithubProjectDetail` (`lib/github-projects/types.ts`)
 * one-for-one where they overlap, so the sidebar renders the same facts
 * the same way on both sides of the app.
 */
export interface OpenSourceToolRepository {
  fullName: string;
  url: string;
  owner: OnboardingGithubIdentity;
  stars: number;
  forks: number;
  openIssuesCount: number;
  contributorCount: number;
  /** SPDX-style license name (e.g. "MIT"), or `null` if GitHub reports none. */
  license: string | null;
  /** Last GitHub push/activity. */
  pushedAt: string;
}

/**
 * One row in the Tool Detail page's Issues tab. Reused verbatim from the
 * GitHub catalog rather than redeclared — a tool's issues are the same
 * GitHub objects, shown the same way, and a second near-identical shape
 * would only let the two drift (rule 51).
 */
export type OpenSourceToolIssuePreview = GithubProjectIssuePreview;

/**
 * `GET /opensource-tools/:slug` — backs the Tool Detail page
 * (`/opensource-tools/:toolSlug`), the DevTunnel-side counterpart to
 * `/github-open-source-tools/:slug`.
 *
 * Extends the grid summary with what only the single-tool view needs:
 * the imported README, the Admin-authored setup guide (sql/017
 * `setup_guide` — the one thing this catalog has that no other page in
 * the app does), the repository block above, and the two pieces of
 * per-viewer state the page's own actions need.
 *
 * Not confirmed against the backend yet — same documented-assumption
 * note as the summary shape above. TODO: confirm `GET
 * /opensource-tools/:slug` and its payload with backend.
 */
export interface OpenSourceToolDetail extends OpenSourceToolSummary {
  /** Imported README from the tool's repository, or `null` when there's none to import. */
  readme: string | null;
  /**
   * The Admin's Step 4 setup guide — how to actually get this tool
   * running. Always a string (onboarding requires it), so the Setup tab
   * never renders an empty panel.
   */
  setupGuide: string;
  /** `null` when the tool's `sourceUrl` isn't a GitHub repository — see above. */
  repository: OpenSourceToolRepository | null;
  /**
   * A page of the repository's currently-open issues, newest first —
   * empty when `repository` is `null`. Never the full issue tracker;
   * GitHub stays the source of truth, which is why every row carries its
   * own `url`.
   */
  openIssues: OpenSourceToolIssuePreview[];

  /**
   * This tool's DevTunnel tasks — read off its linked shadow project
   * (sql/034, backend `GET /opensource-tools/:slug`). `[]` for a tool
   * onboarded before that migration, which has no linked project yet —
   * never distinguished from "linked but genuinely has no tasks", same
   * as any other project's empty task list.
   */
  tasks: Task[];
  /**
   * Slug of the linked shadow project, or `null` pre-sql/034. Every task
   * row's own real destination is a project route
   * (`/projects/:projectSlug/tasks/:taskId`, same as `ProjectTasksPanel`
   * already uses) — this is what makes that link resolvable from a
   * tool's own page without a second request.
   */
  linkedProjectSlug: string | null;

  /**
   * Whether the signed-in contributor has starred this tool through
   * DevTunnel, and how many have — same pair, same meaning, as
   * `GithubProjectDetail.isStarredByViewer` / `.localStarCount`.
   * Computed fresh per viewer, never cached with the rest of the payload.
   */
  isStarredByViewer: boolean;
  localStarCount: number;

  /**
   * Whether the viewer has already put their hand up to help maintain or
   * improve this tool ("Contribute to this tool"). Drives the header
   * button's joined state so a returning contributor isn't invited to
   * join something they already joined.
   */
  viewerIsContributing: boolean;
}