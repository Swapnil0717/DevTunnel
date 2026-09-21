import { SkeletonBlock } from "@/components/ui/skeleton";
import { HOME_PANEL, HOME_PROJECT_GRID } from "./styles";

/** Placeholder for the recommended-project cards — same grid, same card anatomy. */
export function ProjectGridSkeleton({ count }: { count: number }) {
  return (
    <div className={HOME_PROJECT_GRID} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className={`flex flex-col gap-3 p-4 ${HOME_PANEL}`}>
          <div className="flex items-center gap-2.5">
            <SkeletonBlock className="h-7 w-7 flex-none rounded-md" delayMs={index * 100} />
            <div className="flex flex-1 flex-col gap-1.5">
              <SkeletonBlock className="h-3 w-3/5" delayMs={index * 100 + 40} />
              <SkeletonBlock className="h-2.5 w-4/5" delayMs={index * 100 + 80} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <SkeletonBlock className="h-3 w-full" delayMs={index * 100 + 120} />
            <SkeletonBlock className="h-3 w-2/3" delayMs={index * 100 + 160} />
          </div>
          <div className="flex flex-col gap-2 border-t border-[#1A1A1A] pt-3">
            <SkeletonBlock className="h-3 w-20" delayMs={index * 100 + 200} />
            <SkeletonBlock className="h-3 w-36" delayMs={index * 100 + 240} />
            <SkeletonBlock className="h-0.5 w-full" delayMs={index * 100 + 280} />
          </div>
        </div>
      ))}
    </div>
  );
}
