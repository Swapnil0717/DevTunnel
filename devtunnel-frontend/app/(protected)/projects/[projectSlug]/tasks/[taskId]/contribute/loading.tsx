import { SkeletonBlock, SkeletonDetailHeader } from "@/components/ui/skeleton";

/**
 * Next.js route-segment loading boundary for
 * `/projects/:projectSlug/tasks/:taskId/contribute`. Matches the real
 * page's shape: header with two secondary actions, then a task summary
 * card and the CLI / manual step lists on the left, and the repository
 * rail on the right.
 */
export default function TaskContributeLoading() {
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
            <SkeletonBlock className="h-9 w-[110px]" />
            <SkeletonBlock className="h-9 w-[130px]" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <SkeletonBlock className="mb-4 h-2.5 w-16" />
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index}>
                  <SkeletonBlock className="mb-2 h-1 w-full rounded-full" />
                  <SkeletonBlock className="mb-1.5 h-3 w-20" />
                  <SkeletonBlock className="h-2.5 w-28" />
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[10px] border border-border bg-surface p-5">
            <SkeletonBlock className="mb-3 h-2.5 w-20" />
            <SkeletonBlock className="mb-2 h-3.5 w-3/5" />
            <SkeletonBlock className="mb-4 h-3 w-4/5" />
            <SkeletonBlock className="mb-2 h-2.5 w-40" />
            <SkeletonBlock className="h-2.5 w-32" />
          </div>

          <div className="rounded-[10px] border border-border bg-surface p-5">
            <SkeletonBlock className="mb-4 h-3.5 w-56" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-[84px] w-full" />
              ))}
            </div>
          </div>

          <div className="rounded-[10px] border border-border bg-surface p-5">
            <SkeletonBlock className="mb-4 h-3.5 w-64" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-[72px] w-full" />
              ))}
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-[10px] border border-border bg-surface p-4">
              <SkeletonBlock className="mb-3 h-2.5 w-28" />
              <SkeletonBlock className="mb-2 h-3 w-full" />
              <SkeletonBlock className="h-3 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
