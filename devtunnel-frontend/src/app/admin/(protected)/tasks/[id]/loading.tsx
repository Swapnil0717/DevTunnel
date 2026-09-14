import { SkeletonBlock, SkeletonDetailHeader, SkeletonStatCards } from "@/components/ui/skeleton";

/**
 * `/admin/tasks/[id]` — `generateMetadata` and the page both call
 * `getAdminTaskDetail`.
 *
 * Matches the real page's section order: breadcrumb + title/project-link
 * row + action buttons, a 3-card contributor/submission stat row, the
 * (collapsed) edit-details panel, then the bordered tech-stack chip
 * section.
 */
export default function AdminTaskDetailLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonDetailHeader />
      <div className="mb-8">
        <SkeletonBlock className="mb-2.5 h-2.5 w-44" />
        <SkeletonStatCards count={3} />
      </div>
      <SkeletonBlock className="mb-8 h-11 w-full" />
      <div className="rounded-[10px] border border-border bg-surface p-5">
        <SkeletonBlock className="mb-3 h-2.5 w-20" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-5 w-16 rounded-md" />
          ))}
        </div>
      </div>
    </div>
  );
}