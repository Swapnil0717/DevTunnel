import { SkeletonBlock } from "@/components/ui/skeleton";

/**
 * Matches `ProjectCard`'s actual internal layout — a bordered box with a
 * title line, a description line, then a row of tag/match chips —
 * instead of one flat rectangle the same overall height.
 */
export function ProjectGridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border bg-surface p-3">
          <SkeletonBlock className="mb-1.5 h-3 w-3/5" />
          <SkeletonBlock className="mb-2.5 h-2.5 w-full" />
          <SkeletonBlock className="h-3.5 w-14 rounded-[5px]" />
        </div>
      ))}
    </div>
  );
}