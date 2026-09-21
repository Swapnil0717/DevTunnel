import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintPageHeader,
  BlueprintPublicFilterBar,
  BlueprintLoadCatalogBar,
  BlueprintGithubProjectCardGrid,
  BlueprintPagination,
} from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for `/github-open-source-tools`
 * ("Github Open source tools"). Same shell as
 * `/github-projects/loading.tsx` (`BlueprintPageHeader`, the stacked
 * `BlueprintPublicFilterBar` matching `GithubProjectsExplorer`'s real
 * filter bar — this page passes a named catalog filter, so it's 4
 * filters: Show, Tech stack, Minimum stars, Sort by — the
 * `BlueprintLoadCatalogBar` "top N … / Load all" row, and a real
 * skeleton grid rather than a spinner: this catalog is backend-cached
 * for 30 minutes too, so most loads resolve fast enough for the real
 * grid to read as a normal page load).
 */
export default function GithubOpenSourceToolsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 10 — GitHub tools"
      revLabel="Rev — loading tools"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader withAction={false} />
      <BlueprintPublicFilterBar filters={4} />
      <BlueprintLoadCatalogBar />
      <BlueprintGithubProjectCardGrid />
      <BlueprintPagination />
    </BlueprintSheet>
  );
}
