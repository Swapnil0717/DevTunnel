import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintPageHeader,
  BlueprintPublicFilterBar,
  BlueprintDevtunnelProjectCardGrid,
  BlueprintPagination,
} from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for `/projects` ("Projects on
 * Devtunnel"). Wrapped in the same page shell the real page renders
 * (`mx-auto max-w-6xl px-6 py-10`, `BlueprintPageHeader`, and the
 * stacked `BlueprintPublicFilterBar` — search, then a "Match my
 * profile" row for signed-in users, then the Show/Tech stack/Sort by
 * filter row — matching `DevtunnelProjectsExplorer`'s real filter bar)
 * so nothing shifts position once `getRecommendedProjects()` resolves —
 * only the grid and pagination footer below the filters swap from
 * placeholders to real content.
 */
export default function ProjectsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 05 — Projects"
      revLabel="Rev — loading projects"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader withAction={false} />
      <BlueprintPublicFilterBar filters={3} withMatchProfile />
      <BlueprintDevtunnelProjectCardGrid />
      <BlueprintPagination />
    </BlueprintSheet>
  );
}
