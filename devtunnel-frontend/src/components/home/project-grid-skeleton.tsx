import { SkeletonBlock } from "@/components/ui/skeleton";

export function ProjectGridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonBlock key={index} className="h-[86px]" />
      ))}
    </div>
  );
}