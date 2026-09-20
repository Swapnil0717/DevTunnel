import { SkeletonBlock } from "@/components/ui/skeleton";

export function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-1.5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <SkeletonBlock key={index} className="h-9" />
      ))}
    </div>
  );
}