import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
    BlueprintPageHeader,
    BlueprintFilterBar,
    BlueprintDevtunnelProjectCardGrid,
  } from "@/components/ui/blueprint-kit";
  
  /**
   * Next.js route-segment loading boundary for `/projects` ("Projects on
   * Devtunnel"). Wrapped in the same page shell the real page renders
   * (`mx-auto max-w-6xl px-6 py-10`, `BlueprintPageHeader`, and a 3-filter
   * `BlueprintFilterBar` matching `DevtunnelProjectsExplorer`'s real filter
   * bar — Show, Tech stack, Sort by) so nothing shifts position once
   * `getRecommendedProjects()` resolves — only the grid below the filters
   * swaps from placeholders to real cards, same convention
   * `/github-projects/loading.tsx` documents for its own page.
   */
  export default function ProjectsLoading() {
    return (
      <BlueprintSheet
        sheetLabel="Sheet 05 — Projects"
        revLabel="Rev — loading projects"
        contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
      >
        <BlueprintPageHeader withAction={false} />
        <BlueprintFilterBar filters={3} />
        <BlueprintDevtunnelProjectCardGrid />
      </BlueprintSheet>
    );
  }