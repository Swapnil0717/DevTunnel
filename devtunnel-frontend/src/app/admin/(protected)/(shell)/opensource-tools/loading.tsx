// src/app/admin/(protected)/(shell)/opensource-tools/loading.tsx
import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintPageHeader, BlueprintFilterBar, BlueprintToolCardGrid } from "@/components/ui/blueprint-kit";

/**
 * `/admin/opensource-tools` — one `getAdminOpenSourceTools()` fetch,
 * rendered as `AdminOpenSourceToolsExplorer`'s search + Language/Label
 * filters atop a card grid (`AdminOpenSourceToolsGrid`), not a table.
 * Header has one right-hand action ("Add tool").
 */
export default function AdminOpenSourceToolsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A4 — Open source tools"
      revLabel="Rev — loading tools"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader actions={<BlueprintFill className="h-9 w-[92px]" />} />
      <BlueprintFilterBar filters={2} />
      <BlueprintToolCardGrid count={6} />
    </BlueprintSheet>
  );
}