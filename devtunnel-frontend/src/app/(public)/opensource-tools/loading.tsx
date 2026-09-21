import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
    BlueprintPageHeader,
    BlueprintFilterBar,
    BlueprintDevtunnelOpenSourceToolCardGrid,
  } from "@/components/ui/blueprint-kit";
  
  /**
   * Next.js route-segment loading boundary for `/opensource-tools` ("Open
   * Source Tools on Devtunnel"). Wrapped in the same page shell the real
   * page renders (`mx-auto max-w-6xl px-6 py-10`, `BlueprintPageHeader`,
   * and a 3-filter `BlueprintFilterBar` matching
   * `DevtunnelOpenSourceToolsExplorer`'s real filter bar — Language,
   * Label, Sort by) so nothing shifts position once `getOpenSourceTools()`
   * resolves — only the grid below the filters swaps from placeholders to
   * real cards, same convention `/github-open-source-tools/loading.tsx`
   * and `/projects/loading.tsx` each document for their own pages.
   */
  export default function OpenSourceToolsLoading() {
    return (
      <BlueprintSheet
        sheetLabel="Sheet 06 — Open source tools"
        revLabel="Rev — loading tools"
        contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
      >
        <BlueprintPageHeader withAction={false} />
        <BlueprintFilterBar filters={3} />
        <BlueprintDevtunnelOpenSourceToolCardGrid />
      </BlueprintSheet>
    );
  }