import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintPageHeader,
  BlueprintPublicFilterBar,
  BlueprintDevtunnelOpenSourceToolCardGrid,
  BlueprintPagination,
} from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for `/opensource-tools` ("Open
 * Source Tools on Devtunnel"). Wrapped in the same page shell the real
 * page renders (`mx-auto max-w-6xl px-6 py-10`, `BlueprintPageHeader`,
 * and the stacked `BlueprintPublicFilterBar` — matching
 * `DevtunnelOpenSourceToolsExplorer`'s real filter bar: search, then
 * Language/Label/Sort by, no "Match my profile" row) so nothing shifts
 * position once `getOpenSourceTools()` resolves — only the grid and
 * pagination footer below the filters swap from placeholders to real
 * content.
 */
export default function OpenSourceToolsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 06 — Open source tools"
      revLabel="Rev — loading tools"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader withAction={false} />
      <BlueprintPublicFilterBar filters={3} />
      <BlueprintDevtunnelOpenSourceToolCardGrid />
      <BlueprintPagination />
    </BlueprintSheet>
  );
}
