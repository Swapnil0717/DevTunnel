import { SkeletonBlock, SkeletonDetailHeader } from "@/components/ui/skeleton";

/**
 * Next.js route-segment loading boundary for
 * `/projects/:projectSlug/tasks/:taskId`. Same shimmer-skeleton
 * convention as `/admin/tasks/:id/loading.tsx` (a cheap, indexed
 * single-row read, not a live scan — the fixed-shape skeleton is the
 * honest signal here), trimmed to match this page's own layout exactly:
 * one action button ("View issue #N" — `actions` below), no stat cards
 * (`/admin/tasks/:id` has Working/Completed/Submitted; this contributor
 * page doesn't), and three bordered sections in the same order the real
 * page renders them — Details (role/difficulty/contributors), Tech
 * stack, then the GitHub issue/description body.
 */
export default function TaskDetailLoading() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10" aria-hidden="true">
      <SkeletonDetailHeader
        meta={
          <>
            <SkeletonBlock className="h-3 w-28" />
            <span className="text-text-faint">·</span>
            <SkeletonBlock className="h-3 w-36" />
            <span className="text-text-faint">·</span>
            <SkeletonBlock className="h-4 w-16 rounded-full" />
          </>
        }
        actions={<SkeletonBlock className="h-9 w-[150px]" />}
      />

      <div className="mb-8 rounded-[10px] border border-border bg-surface p-5">
        <SkeletonBlock className="mb-3 h-2.5 w-20" />
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[140px_1fr]">
          <SkeletonBlock className="h-2.5 w-14" />
          <SkeletonBlock className="h-2.5 w-24" />
          <SkeletonBlock className="h-2.5 w-16" />
          <SkeletonBlock className="h-2.5 w-20" />
          <SkeletonBlock className="h-2.5 w-20" />
          <SkeletonBlock className="h-2.5 w-32" />
        </div>
      </div>

      <div className="mb-8 rounded-[10px] border border-border bg-surface p-5">
        <SkeletonBlock className="mb-3 h-2.5 w-20" />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-5 w-16 rounded-md" />
          ))}
        </div>
      </div>

      <div className="rounded-[10px] border border-border bg-surface p-5">
        <SkeletonBlock className="mb-2 h-2.5 w-24" />
        <SkeletonBlock className="mb-3 h-3.5 w-3/5" />
        <SkeletonBlock className="h-[260px] w-full" />
      </div>
    </main>
  );
}