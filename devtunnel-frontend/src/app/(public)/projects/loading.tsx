import {
    SkeletonPageHeader,
    SkeletonFilterBar,
    SkeletonDevtunnelProjectCardGrid,
  } from "@/components/ui/skeleton";
  
  /**
   * Next.js route-segment loading boundary for `/projects` ("Projects on
   * Devtunnel"). Wrapped in the same page shell the real page renders
   * (`mx-auto max-w-6xl px-6 py-10`, `SkeletonPageHeader`, and a 3-filter
   * `SkeletonFilterBar` matching `DevtunnelProjectsExplorer`'s real filter
   * bar — Show, Tech stack, Sort by) so nothing shifts position once
   * `getRecommendedProjects()` resolves — only the grid below the filters
   * swaps from placeholders to real cards, same convention
   * `/github-projects/loading.tsx` documents for its own page.
   */
  export default function ProjectsLoading() {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <SkeletonPageHeader withAction={false} />
        <SkeletonFilterBar filters={3} />
        <SkeletonDevtunnelProjectCardGrid />
      </main>
    );
  }