import { SkeletonBlock, SkeletonDetailHeader, SkeletonStatCards } from "@/components/ui/skeleton";

/**
 * `/admin/projects/[id]` — `generateMetadata` and the page component each
 * call `getAdminProjectDetail`, plus a second parallel `getAdminProjectTasks`
 * fetch (see the page's own comment on why those two run together via
 * `Promise.all` rather than one after the other).
 *
 * Matches the real page's section order: breadcrumb + title/repo-link
 * row + action buttons, a 5-card contributor/task/issue stat row, the
 * (collapsed) edit-details panel, a short list of task rows, then the
 * bordered README panel.
 */
export default function AdminProjectDetailLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonDetailHeader />
      <div className="mb-8">
        <SkeletonBlock className="mb-2.5 h-2.5 w-48" />
        <SkeletonStatCards count={5} />
      </div>
      <SkeletonBlock className="mb-8 h-11 w-full" />
      <div className="mb-8">
        <SkeletonBlock className="mb-2.5 h-2.5 w-28" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-[52px] w-full" />
          ))}
        </div>
      </div>
      <div className="rounded-[10px] border border-border bg-surface p-5">
        <SkeletonBlock className="mb-2 h-2.5 w-20" />
        <SkeletonBlock className="h-[260px] w-full" />
      </div>
    </div>
  );
}