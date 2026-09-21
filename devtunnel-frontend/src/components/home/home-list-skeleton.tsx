import { SkeletonBlock } from "@/components/ui/skeleton";
import { HOME_LIST } from "./styles";

/**
 * Loading placeholder for Home's task and activity lists: the same bordered,
 * hairline-divided panel the real list renders in, with two-line rows, so the
 * page doesn't jump when data arrives. (`ListSkeleton` is still what the
 * other pages use; this one matches the redesigned rows.)
 */
export function HomeListSkeleton({ rows }: { rows: number }) {
  return (
    <div className={HOME_LIST} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex flex-col gap-1.5 px-4 py-3">
          <SkeletonBlock className="h-3.5 w-3/5" delayMs={index * 80} />
          <SkeletonBlock className="h-3 w-1/4" delayMs={index * 80 + 50} />
        </div>
      ))}
    </div>
  );
}
