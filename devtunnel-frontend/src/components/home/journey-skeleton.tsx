import { TASK_STAGES } from "@/lib/tasks/progress";
import {
  HOME_SKELETON_SURFACE,
  HomeSkeletonBlock,
  SkeletonLine,
  lineHeightPx,
  type HomeSkeletonProps,
} from "./skeleton-kit";

/** Typical label widths for the four steps (Open · Started a task · PR submitted · Done). */
const STEP_LABEL_WIDTHS = ["w-8", "w-20", "w-20", "w-8"];

/** Typical label widths for the three stat cells (In progress · PRs submitted · Tasks completed). */
const STAT_LABEL_WIDTHS = ["w-16", "w-20", "w-24"];

/**
 * Placeholder for `JourneyCard` — same panel, same internal rows, so nothing
 * shifts when the real card streams in. Measured against `journey-card.tsx`:
 *
 *  - body: `px-5 pb-[22px] pt-[18px]`; heading line (12.5px) + `mb-[18px]`;
 *  - stepper: four columns, each a 9px dot + `mb-3` + a 12.5px label line, with
 *    the hairline connector the real stepper draws between dots;
 *  - footer: `border-t px-5 py-3.5`; a message that wraps to two 13px/1.6 lines
 *    (the usual case — every state's copy is longer than one 430px line) beside
 *    the CTA button (`px-[13px] py-2`, 12.5px text → 34.75px tall).
 */
export function JourneyCardSkeleton({ tone = "page", baseDelay = 0 }: HomeSkeletonProps) {
  const s = HOME_SKELETON_SURFACE[tone];

  return (
    <div className={`mb-3 ${s.panel}`}>
      <div className="px-5 pb-[22px] pt-[18px]">
        <SkeletonLine height={lineHeightPx(12.5)} className="mb-[18px]">
          <HomeSkeletonBlock tone={tone} className="h-3 w-40" delayMs={baseDelay} />
        </SkeletonLine>

        <div className="grid grid-cols-4">
          {TASK_STAGES.map((stage, index) => {
            const last = index === TASK_STAGES.length - 1;
            const delayMs = baseDelay + 40 + index * 30;
            return (
              <div key={stage.status} className="relative">
                <HomeSkeletonBlock
                  tone={tone}
                  className="mb-3 h-[9px] w-[9px]"
                  rounded="rounded-full"
                  delayMs={delayMs}
                />
                {!last ? (
                  <span
                    aria-hidden="true"
                    className={`absolute left-[15px] right-[9px] top-1 h-px ${s.hairline}`}
                  />
                ) : null}
                <SkeletonLine height={lineHeightPx(12.5)} className="pr-2">
                  <HomeSkeletonBlock
                    tone={tone}
                    className={`h-3 max-w-full ${STEP_LABEL_WIDTHS[index] ?? "w-16"}`}
                    delayMs={delayMs + 20}
                  />
                </SkeletonLine>
              </div>
            );
          })}
        </div>
      </div>

      <div
        className={`flex flex-wrap items-center justify-between gap-4 border-t ${s.rule} px-5 py-3.5`}
      >
        <div className="w-[430px] max-w-full">
          <SkeletonLine height={lineHeightPx(13, 1.6)}>
            <HomeSkeletonBlock tone={tone} className="h-3 w-full" delayMs={baseDelay + 160} />
          </SkeletonLine>
          <SkeletonLine height={lineHeightPx(13, 1.6)}>
            <HomeSkeletonBlock tone={tone} className="h-3 w-3/5" delayMs={baseDelay + 190} />
          </SkeletonLine>
        </div>
        <HomeSkeletonBlock
          tone={tone}
          className="h-[34.75px] w-[124px] flex-none"
          rounded="rounded-[7px]"
          delayMs={baseDelay + 220}
        />
      </div>
    </div>
  );
}

/**
 * Placeholder for `TaskStats` — one bordered panel split by hairlines into
 * three cells, not three separate tiles. Cell box and type scale are the real
 * ones: `px-3 py-3.5 sm:px-5 sm:py-4`, a 12.5px label line, `mt-1`, then a
 * 28px/1.2 figure (33.6px line).
 */
export function TaskStatsSkeleton({ tone = "page", baseDelay = 0 }: HomeSkeletonProps) {
  const s = HOME_SKELETON_SURFACE[tone];

  return (
    <div className={`mb-9 grid grid-cols-3 ${s.panel}`}>
      {STAT_LABEL_WIDTHS.map((labelWidth, index) => (
        <div
          key={index}
          className={`px-3 py-3.5 sm:px-5 sm:py-4 ${index > 0 ? `border-l ${s.rule}` : ""}`}
        >
          <SkeletonLine height={lineHeightPx(12.5)}>
            <HomeSkeletonBlock
              tone={tone}
              className={`h-3 max-w-full ${labelWidth}`}
              delayMs={baseDelay + index * 40}
            />
          </SkeletonLine>
          <SkeletonLine height={lineHeightPx(28, 1.2)} className="mt-1">
            <HomeSkeletonBlock
              tone={tone}
              className="h-[22px] w-8"
              delayMs={baseDelay + index * 40 + 30}
            />
          </SkeletonLine>
        </div>
      ))}
    </div>
  );
}

/**
 * The `<Suspense>` fallback `home/page.tsx` shows for the journey card + stat
 * strip: both panels, exactly as `JourneyCard` and `TaskStats` render them.
 */
export function JourneySkeleton({ tone = "page", baseDelay = 0 }: HomeSkeletonProps) {
  return (
    <div aria-hidden="true">
      <JourneyCardSkeleton tone={tone} baseDelay={baseDelay} />
      <TaskStatsSkeleton tone={tone} baseDelay={baseDelay + 160} />
    </div>
  );
}
