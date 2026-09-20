import { SkeletonBlock, SkeletonDetailHeader } from "@/components/ui/skeleton";

/**
 * Next.js route-segment loading boundary for
 * `/projects/:projectSlug/tasks/:taskId`. Same shimmer-skeleton
 * convention as `/admin/tasks/:id/loading.tsx`, trimmed to match this
 * page's own layout: the two header actions (Contribute + View issue),
 * then the two-column body — three stacked description sections (project,
 * task, issue) on the left and the Details / Tech stack rail on the right.
 */
export default function TaskDetailLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10" aria-hidden="true">
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
        actions={
          <>
            <SkeletonBlock className="h-9 w-[170px]" />
            <SkeletonBlock className="h-9 w-[130px]" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <SkeletonBlock className="mb-3 h-2.5 w-28" />
            <div className="flex items-start gap-3">
              <SkeletonBlock className="h-10 w-10 shrink-0 rounded-[10px]" />
              <div className="flex flex-1 flex-col gap-2">
                <SkeletonBlock className="h-3.5 w-40" />
                <SkeletonBlock className="h-3 w-48" />
                <SkeletonBlock className="mt-2 h-3 w-full" />
                <SkeletonBlock className="h-3 w-4/5" />
              </div>
            </div>
          </div>

          <div className="rounded-[10px] border border-border bg-surface p-5">
            <SkeletonBlock className="mb-3 h-2.5 w-28" />
            <SkeletonBlock className="h-[140px] w-full" />
          </div>

          <div className="rounded-[10px] border border-border bg-surface p-5">
            <SkeletonBlock className="mb-3 h-2.5 w-28" />
            <SkeletonBlock className="mb-3 h-3.5 w-3/5" />
            <SkeletonBlock className="h-[220px] w-full" />
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <SkeletonBlock className="mb-3 h-2.5 w-16" />
            <div className="grid grid-cols-[92px_1fr] gap-x-4 gap-y-3">
              <SkeletonBlock className="h-2.5 w-12" />
              <SkeletonBlock className="h-2.5 w-20" />
              <SkeletonBlock className="h-2.5 w-10" />
              <SkeletonBlock className="h-2.5 w-24" />
              <SkeletonBlock className="h-2.5 w-16" />
              <SkeletonBlock className="h-2.5 w-20" />
              <SkeletonBlock className="h-2.5 w-20" />
              <SkeletonBlock className="h-2.5 w-28" />
            </div>
          </div>
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <SkeletonBlock className="mb-3 h-2.5 w-20" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-5 w-16 rounded-md" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
