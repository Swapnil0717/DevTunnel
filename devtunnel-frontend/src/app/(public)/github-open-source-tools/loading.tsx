import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintListPageHeader,
  BlueprintPublicFilterBar,
  BlueprintLoadCatalogBar,
  BlueprintGithubProjectCardGrid,
  BlueprintPagination,
} from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for `/github-open-source-tools`
 * ("Github Open Source Tools"). Same shell and the same card grid as
 * `/github-projects/loading.tsx` (this page reuses `GithubProjectsExplorer`
 * and `GithubProjectCard`), with the three things that differ:
 *
 *  - the page's own title and subtitle;
 *  - three filters, not four — "Show" (the named catalog filter), Tech
 *    stack and Sort by. The page passes `hideStarFilters`, so Minimum and
 *    Maximum stars aren't rendered at all;
 *  - "tools" as the noun in the "Showing the top N tools … / Load all
 *    tools" row.
 *
 * Like the Projects page it keeps the search row's "Refresh" button and
 * the "Ask AI to find tools" panel, and renders a real skeleton grid
 * rather than a spinner: this catalog is backend-cached for 30 minutes
 * too, so most loads resolve fast enough for the real grid to read as a
 * normal page load.
 */
export default function GithubOpenSourceToolsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 10 — GitHub tools"
      revLabel="Rev — loading tools"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintListPageHeader
        title="Github Open Source Tools"
        description="Real open-source developer tools from across GitHub — search or filter by tech stack, stars, and activity to find one worth exploring."
      />
      <BlueprintPublicFilterBar
        labels={["Show", "Tech stack", "Sort by"]}
        withRefresh
        withAiSearch
      />
      <BlueprintLoadCatalogBar noun="tools" />
      <BlueprintGithubProjectCardGrid />
      <BlueprintPagination />
    </BlueprintSheet>
  );
}
