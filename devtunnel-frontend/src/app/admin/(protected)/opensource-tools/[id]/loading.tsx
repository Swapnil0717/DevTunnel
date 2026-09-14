import { SkeletonBlock, SkeletonDetailHeader } from "@/components/ui/skeleton";

/**
 * `/admin/opensource-tools/[id]` — `generateMetadata` and the page both
 * call `getAdminOpenSourceToolDetail`.
 *
 * Matches the real page's section order: breadcrumb + square-logo/title/
 * source-link row + action buttons, the (collapsed) edit-details panel,
 * then the bordered README panel — there's no stat-card row or body-copy
 * section on this page, unlike Project/Task detail.
 */
export default function AdminOpenSourceToolDetailLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonDetailHeader withLogo />
      <SkeletonBlock className="mb-8 h-11 w-full" />
      <div className="rounded-[10px] border border-border bg-surface p-5">
        <SkeletonBlock className="mb-2 h-2.5 w-20" />
        <SkeletonBlock className="h-[260px] w-full" />
      </div>
    </div>
  );
}