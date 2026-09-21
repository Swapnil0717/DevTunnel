import { SkeletonBlock } from "@/components/ui/skeleton";
import { HOME_PANEL } from "./styles";

/**
 * Placeholder for the journey card and the stat strip beneath it — same
 * panels, same internal rows, so nothing shifts when the real ones stream in.
 */
export function JourneySkeleton() {
  return (
    <div aria-hidden="true">
      <div className={`mb-3 ${HOME_PANEL}`}>
        <div className="px-5 pb-[22px] pt-[18px]">
          <SkeletonBlock className="mb-[18px] h-3 w-40" />
          <div className="grid grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index}>
                <SkeletonBlock className="mb-3 h-[9px] w-[9px] rounded-full" />
                <SkeletonBlock className="h-3 w-3/5" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-[#1F1F1F] px-5 py-3.5">
          <SkeletonBlock className="h-4 w-2/3 max-w-[430px]" />
          <SkeletonBlock className="h-[34px] w-28 rounded-[7px]" />
        </div>
      </div>

      <div className={`mb-9 grid grid-cols-3 ${HOME_PANEL}`}>
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className={`px-3 py-3.5 sm:px-5 sm:py-4 ${index > 0 ? "border-l border-[#1F1F1F]" : ""}`}
          >
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="mt-2 h-7 w-8" />
          </div>
        ))}
      </div>
    </div>
  );
}
