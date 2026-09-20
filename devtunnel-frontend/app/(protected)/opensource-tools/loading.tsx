import {
    SkeletonPageHeader,
    SkeletonFilterBar,
    SkeletonDevtunnelOpenSourceToolCardGrid,
  } from "@/components/ui/skeleton";
  
  /**
   * Next.js route-segment loading boundary for `/opensource-tools` ("Open
   * Source Tools on Devtunnel"). Wrapped in the same page shell the real
   * page renders (`mx-auto max-w-6xl px-6 py-10`, `SkeletonPageHeader`,
   * and a 3-filter `SkeletonFilterBar` matching
   * `DevtunnelOpenSourceToolsExplorer`'s real filter bar — Language,
   * Label, Sort by) so nothing shifts position once `getOpenSourceTools()`
   * resolves — only the grid below the filters swaps from placeholders to
   * real cards, same convention `/github-open-source-tools/loading.tsx`
   * and `/projects/loading.tsx` each document for their own pages.
   */
  export default function OpenSourceToolsLoading() {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <SkeletonPageHeader withAction={false} />
        <SkeletonFilterBar filters={3} />
        <SkeletonDevtunnelOpenSourceToolCardGrid />
      </main>
    );
  }