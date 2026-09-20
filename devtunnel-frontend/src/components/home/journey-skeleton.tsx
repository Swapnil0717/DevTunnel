import { SkeletonBlock } from "@/components/ui/skeleton";

export function JourneySkeleton() {
  return (
    <div aria-hidden="true">
      <div className="mb-5 rounded-xl border border-border bg-surface p-4 sm:p-5">
        <SkeletonBlock className="mb-3 h-2.5 w-40" />
        <div className="mb-3.5 grid grid-cols-4 gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-1" />
          ))}
        </div>
        <SkeletonBlock className="h-4 w-2/3" />
      </div>
      <div className="mb-5 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-[68px]" />
        ))}
      </div>
    </div>
  );
}
