import { SkeletonBlock, SkeletonDetailHeader, SkeletonStatCards } from "@/components/ui/skeleton";

/**
 * `/admin/projects/[id]` — `generateMetadata` and the page component each
 * call `getAdminProjectDetail`, plus a second parallel `getAdminProjectTasks`
 * fetch (see the page's own comment on why those two run together via
 * `Promise.all` rather than one after the other).
 *
 * Matches the real page's section order and internal shape:
 * - Back link + breadcrumb + title, a 3-chip meta row (repo link ·
 *   @author · status badge), and all five header actions (View on
 *   GitHub, Edit details, Sync GitHub data, Archive/Reactivate project,
 *   Delete) — not a generic two-button placeholder.
 * - A 5-card contributor/task/issue stat row (`sm:grid-cols-5`, matching
 *   `AdminStatCard`'s own grid).
 * - `EditProjectDetailsPanel`'s two *separate* bordered read-mode cards
 *   (Description, Tech stack), each with its own heading + small "Edit"
 *   pill — not one flattened bar standing in for both.
 * - The task list's heading row (with its own "View all" link), and
 *   each task row's actual left icon+title / right submissions+status
 *   shape rather than a single flat bar.
 * - The bordered README panel.
 */
export default function AdminProjectDetailLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonDetailHeader
        meta={
          <>
            <SkeletonBlock className="h-3 w-40" />
            <span className="text-text-faint">·</span>
            <SkeletonBlock className="h-3 w-20" />
            <span className="text-text-faint">·</span>
            <SkeletonBlock className="h-4 w-16 rounded-full" />
          </>
        }
        actions={
          <>
            <SkeletonBlock className="h-9 w-[130px]" />
            <SkeletonBlock className="h-9 w-[124px]" />
            <SkeletonBlock className="h-9 w-[152px]" />
            <SkeletonBlock className="h-9 w-[140px]" />
            <SkeletonBlock className="h-9 w-[92px]" />
          </>
        }
      />

      <div className="mb-8">
        <SkeletonBlock className="mb-2.5 h-2.5 w-48" />
        <SkeletonStatCards count={5} />
      </div>

      <div className="mb-8 rounded-[10px] border border-border bg-surface p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <SkeletonBlock className="h-2.5 w-24" />
          <SkeletonBlock className="h-5 w-12" />
        </div>
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="mt-2 h-3 w-4/5" />
      </div>

      <div className="mb-8 rounded-[10px] border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <SkeletonBlock className="h-2.5 w-24" />
          <SkeletonBlock className="h-5 w-12" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-5 w-16 rounded-md" />
          ))}
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-2.5 flex items-center justify-between">
          <SkeletonBlock className="h-2.5 w-28" />
          <SkeletonBlock className="h-2.5 w-14" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-border bg-surface px-4 py-3"
            >
              <SkeletonBlock className="h-3.5 w-2/5" />
              <div className="flex shrink-0 items-center gap-3">
                <SkeletonBlock className="h-2.5 w-16" />
                <SkeletonBlock className="h-4 w-14 rounded-full" />
              </div>
            </div>
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