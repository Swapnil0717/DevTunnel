// src/app/admin/(protected)/opensource-tools/loading.tsx
import { SkeletonBlock, SkeletonPageHeader, SkeletonFilterBar, SkeletonToolCardGrid } from "@/components/ui/skeleton";

/**
 * `/admin/opensource-tools` — one `getAdminOpenSourceTools()` fetch,
 * rendered as `AdminOpenSourceToolsExplorer`'s search + Language/Label
 * filters atop a card grid (`AdminOpenSourceToolsGrid`), not a table.
 * Header has one right-hand action ("Add tool").
 */
export default function AdminOpenSourceToolsLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10" aria-hidden="true">
      <SkeletonPageHeader actions={<SkeletonBlock className="h-9 w-[92px]" />} />
      <SkeletonFilterBar filters={2} />
      <SkeletonToolCardGrid count={6} />
    </main>
  );
}