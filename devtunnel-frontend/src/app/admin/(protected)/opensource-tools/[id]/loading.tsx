import { SkeletonBlock, SkeletonDetailHeader } from "@/components/ui/skeleton";

/**
 * `/admin/opensource-tools/[id]` — `generateMetadata` and the page both
 * call `getAdminOpenSourceToolDetail`.
 *
 * Matches the real page's section order and internal shape:
 * - Back link + breadcrumb + square-logo/title row, a meta row (source
 *   URL · primary language), and both header actions (View source,
 *   Delete) — there's no stat-card row on this page, unlike Project/
 *   Task detail.
 * - `EditOpenSourceToolDetailsPanel`'s three *separate* bordered
 *   read-mode cards (Description, Labels, Setup & usage), each with its
 *   own heading + small "Edit" pill — not one flattened bar standing in
 *   for all three.
 * - The bordered README panel.
 */
export default function AdminOpenSourceToolDetailLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonDetailHeader
        withLogo
        meta={
          <>
            <SkeletonBlock className="h-3 w-48" />
            <span className="text-text-faint">·</span>
            <SkeletonBlock className="h-3 w-16" />
          </>
        }
        actions={
          <>
            <SkeletonBlock className="h-9 w-[118px]" />
            <SkeletonBlock className="h-9 w-[92px]" />
          </>
        }
      />

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
          <SkeletonBlock className="h-2.5 w-14" />
          <SkeletonBlock className="h-5 w-12" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-5 w-14 rounded-md" />
          ))}
        </div>
      </div>

      <div className="mb-8 rounded-[10px] border border-border bg-surface p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <SkeletonBlock className="h-2.5 w-32" />
          <SkeletonBlock className="h-5 w-12" />
        </div>
        <div className="flex flex-col gap-2">
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-3/5" />
        </div>
      </div>

      <div className="rounded-[10px] border border-border bg-surface p-5">
        <SkeletonBlock className="mb-2 h-2.5 w-20" />
        <SkeletonBlock className="h-[260px] w-full" />
      </div>
    </div>
  );
}