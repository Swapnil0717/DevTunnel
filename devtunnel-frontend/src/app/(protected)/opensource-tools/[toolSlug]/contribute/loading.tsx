import { SkeletonBlock, SkeletonDetailHeader } from "@/components/ui/skeleton";

/**
 * Route-segment loading boundary for `/opensource-tools/:toolSlug/contribute`.
 *
 * Shaped to this page's real layout — logo + header with two secondary
 * buttons, a three-tab strip, a filter row, a list of contribution cards, and
 * the rail's stack of cards — so the swap to real content doesn't visibly
 * reflow. Same shimmer-skeleton convention as the tool page's own
 * `loading.tsx`.
 */
export default function ToolContributeLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10" aria-hidden="true">
      <SkeletonDetailHeader
        withLogo
        meta={
          <>
            <SkeletonBlock className="h-3 w-40" />
            <span className="text-text-faint">·</span>
            <SkeletonBlock className="h-3 w-36" />
          </>
        }
        actions={
          <>
            <SkeletonBlock className="h-9 w-[140px]" />
            <SkeletonBlock className="h-9 w-[132px]" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex gap-4 border-b border-border-subtle pb-[9px]">
            {["w-[124px]", "w-[104px]", "w-[92px]"].map((width) => (
              <SkeletonBlock key={width} className={`h-3 ${width}`} />
            ))}
          </div>

          <div className="rounded-[10px] border border-border bg-surface p-4">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Array.from({ length: 4 }).map((_, index) => (
                <SkeletonBlock key={index} className="h-6 w-20 rounded-[7px]" />
              ))}
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <SkeletonBlock className="h-8 flex-1 rounded-[8px]" />
              <SkeletonBlock className="h-8 w-28 rounded-[8px]" />
              <SkeletonBlock className="h-8 w-28 rounded-[8px]" />
            </div>

            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-[9px] border border-border-subtle bg-surface-raised p-3.5"
                >
                  <SkeletonBlock className="mb-2 h-3 w-2/3" />
                  <SkeletonBlock className="mb-2.5 h-2.5 w-1/2" />
                  <div className="flex gap-1.5">
                    {Array.from({ length: 3 }).map((_, tagIndex) => (
                      <SkeletonBlock key={tagIndex} className="h-5 w-14 rounded-md" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-[10px] border border-border bg-surface p-4">
              <SkeletonBlock className="mb-3 h-2.5 w-24" />
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, rowIndex) => (
                  <SkeletonBlock key={rowIndex} className="h-2.5 w-full" />
                ))}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </main>
  );
}
