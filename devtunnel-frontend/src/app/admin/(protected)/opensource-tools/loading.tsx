import { SkeletonPageHeader, SkeletonBlock } from "@/components/ui/skeleton";

/** `/admin/opensource-tools` — one `getAdminOpenSourceTools()` fetch, rendered as a card grid (`AdminOpenSourceToolsGrid`), not a table. */
export default function AdminOpenSourceToolsLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-[120px] border border-border" />
        ))}
      </div>
    </div>
  );
}