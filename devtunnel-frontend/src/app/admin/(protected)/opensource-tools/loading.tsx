import { SkeletonPageHeader, SkeletonFilterBar, SkeletonToolCardGrid } from "@/components/ui/skeleton";

/** `/admin/opensource-tools` — one `getAdminOpenSourceTools()` fetch, rendered as `AdminOpenSourceToolsExplorer`'s search + Language/Label filters atop a card grid (`AdminOpenSourceToolsGrid`), not a table. */
export default function AdminOpenSourceToolsLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader />
      <SkeletonFilterBar filters={2} />
      <SkeletonToolCardGrid count={6} />
    </div>
  );
}