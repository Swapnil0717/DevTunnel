import { SkeletonBlock, SkeletonDetailHeader } from "@/components/ui/skeleton";

/**
 * Route-segment loading boundary for `/submissions/:slug` (and its
 * `/edit` child). Without its own, navigating here would show the list
 * page's skeleton from `../loading.tsx` — a stack of cards where a
 * detail page is about to appear. Shaped to the real page instead: a
 * logo'd header with its action buttons, then the main column's cards
 * beside the right-hand rail, so nothing shifts when
 * `getSubmissionBySlug()` resolves.
 */
export default function SubmissionDetailLoading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10" aria-hidden="true">
      <SkeletonDetailHeader
        withLogo
        meta={
          <>
            <SkeletonBlock className="h-3 w-16" />
            <span className="text-text-faint">·</span>
            <SkeletonBlock className="h-3 w-40" />
            <span className="text-text-faint">·</span>
            <SkeletonBlock className="h-3 w-24" />
          </>
        }
        actions={
          <>
            <SkeletonBlock className="h-9 w-32" />
            <SkeletonBlock className="h-9 w-24" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <SkeletonBlock className="mb-3 h-2.5 w-14" />
            <SkeletonBlock className="mb-2 h-3 w-full" />
            <SkeletonBlock className="h-3 w-2/3" />
          </div>
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[140px_1fr]">
              <SkeletonBlock className="h-2.5 w-20" />
              <SkeletonBlock className="h-2.5 w-2/5" />
              <SkeletonBlock className="h-2.5 w-24" />
              <SkeletonBlock className="h-2.5 w-16" />
              <SkeletonBlock className="h-2.5 w-20" />
              <SkeletonBlock className="h-2.5 w-1/2" />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-border-subtle pt-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-5 w-16 rounded-md" />
              ))}
            </div>
          </div>
          <div className="rounded-[10px] border border-border bg-surface p-5">
            <SkeletonBlock className="mb-3 h-2.5 w-16" />
            <SkeletonBlock className="mb-2 h-3 w-full" />
            <SkeletonBlock className="mb-2 h-3 w-5/6" />
            <SkeletonBlock className="h-3 w-3/4" />
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
          <SkeletonBlock className="h-32 w-full rounded-[10px]" />
          <SkeletonBlock className="h-40 w-full rounded-[10px]" />
        </div>
      </div>
    </main>
  );
}
