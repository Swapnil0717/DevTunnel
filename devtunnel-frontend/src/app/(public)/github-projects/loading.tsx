import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintListPageHeader,
  BlueprintPublicFilterBar,
  BlueprintLoadCatalogBar,
  BlueprintGithubProjectCardGrid,
  BlueprintPagination,
} from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for `/github-projects`
 * ("GitHub Projects"). Wrapped in the exact same page shell the real
 * page renders (`mx-auto max-w-6xl px-6 py-10`) and, piece for piece, the
 * same stack `GithubProjectsExplorer` renders, so nothing shifts once
 * `getGithubProjects()` resolves — only the placeholders swap for real
 * content:
 *
 *  - the real title and subtitle (`BlueprintListPageHeader`, ghosted from
 *    the page's own copy so the subtitle wraps where the real one does);
 *  - the search row with its "Refresh" button on the right;
 *  - the "Ask AI to find projects" panel;
 *  - the four labelled filters this page shows — Tech stack, Minimum
 *    stars, Maximum stars, Sort by (no "Show" filter: that is the Tools
 *    page's);
 *  - the "Showing the top N projects … / Load all projects" row;
 *  - the card grid (`BlueprintGithubProjectCardGrid`, sized to
 *    `GithubProjectCard`) and the numbered pagination footer.
 *
 * Renders a real skeleton grid rather than a spinner:
 * `getGithubProjects()` (`lib/github-projects/api.ts`) is backed by a live
 * GitHub-wide catalog, but the backend caches that scan for 30 minutes
 * (src/routes/githubProjects.ts), so most loads resolve fast enough that a
 * real grid skeleton reads as a normal page load.
 */
export default function GithubProjectsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 09 — GitHub projects"
      revLabel="Rev — loading projects"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintListPageHeader
        title="GitHub Projects"
        description="Real open-source projects from across GitHub — search or filter by tech stack, stars, and activity to find one worth exploring."
      />
      <BlueprintPublicFilterBar
        labels={["Tech stack", "Minimum stars", "Maximum stars", "Sort by"]}
        withRefresh
        withAiSearch
      />
      <BlueprintLoadCatalogBar noun="projects" />
      <BlueprintGithubProjectCardGrid />
      <BlueprintPagination />
    </BlueprintSheet>
  );
}
