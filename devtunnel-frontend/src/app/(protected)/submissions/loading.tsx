import { SkeletonBlock } from "@/components/ui/skeleton";

/**
 * Route-segment loading boundary for `/submissions`.
 *
 * Shaped to the real page — heading, category chips, the search/sort
 * row, the tech chip row, then a stack of submission cards each with
 * its upvote column — so the swap to real content doesn't visibly
 * reflow. Same shimmer-skeleton convention as every other list route
 * here.
 */
export default function SubmissionsLoading() {
  return (
    <main className="w-full px-6 py-10 lg:px-10" aria-hidden="true">
      <SkeletonBlock className="mb-2 h-5 w-40" />
      <SkeletonBlock className="mb-6 h-3 w-[420px] max-w-full" />

      <div className="mb-3 flex flex-wrap gap-1.5">
        {["w-24", "w-20", "w-16", "w-[190px]"].map((width) => (
          <SkeletonBlock key={width} className={`h-6 ${width} rounded-[7px]`} />
        ))}
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        <SkeletonBlock className="h-8 flex-1 rounded-[8px]" />
        <SkeletonBlock className="h-8 w-28 rounded-[8px]" />
        <SkeletonBlock className="h-9 w-[190px] rounded-[8px]" />
      </div>
      <SkeletonBlock className="mb-4 h-2.5 w-52" />

      <div className="mb-4 flex flex-wrap gap-1.5">
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-5 w-16 rounded-[6px]" />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex gap-3 rounded-[10px] border border-border-subtle bg-surface-raised p-4"
          >
            <div className="flex shrink-0 flex-col items-center gap-1">
              <SkeletonBlock className="h-8 w-9 rounded-[7px]" />
              <SkeletonBlock className="h-2.5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <SkeletonBlock className="mb-2 h-3 w-1/3" />
              <SkeletonBlock className="mb-1.5 h-2.5 w-full" />
              <SkeletonBlock className="mb-3 h-2.5 w-2/3" />
              <div className="flex gap-1.5">
                {Array.from({ length: 4 }).map((_, tagIndex) => (
                  <SkeletonBlock key={tagIndex} className="h-5 w-14 rounded-md" />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
