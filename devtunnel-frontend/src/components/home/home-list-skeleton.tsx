import {
  HOME_SKELETON_SURFACE,
  HomeSkeletonBlock,
  SkeletonLine,
  lineHeightPx,
  type HomeSkeletonProps,
} from "./skeleton-kit";
import { HOME_ACTIVITY_ROW_LAYOUT, HOME_ROW_LAYOUT } from "./styles";

/** Which real list this placeholder stands in for — each one has its own row anatomy. */
export type HomeListSkeletonVariant = "recommended" | "mine" | "activity";

/** Varied bar widths so a column of rows reads as text, not a ruler. */
const TITLE_WIDTHS = ["w-3/5", "w-2/3", "w-1/2", "w-3/4", "w-3/5"];

/**
 * Loading placeholder for Home's three lists. Every variant is the real
 * list's own panel and rows, line for line, so the page doesn't jump when
 * data arrives:
 *
 *  - `"recommended"` — `RecommendedTasksList`: `HOME_LIST` rows
 *    (`HOME_ROW_LAYOUT`: `px-4 py-3`), a 13px title line over a 12px project
 *    line, and the "Match · …" text on the right (stacked under on phones).
 *  - `"mine"` — `MyTasksList`: the one-line stage tally (12px, `mb-2`) above the
 *    list, and on each row the PR/stage side: a 57px four-segment bar
 *    (4 × 12px + 3 × 3px gaps, 3px tall) and the 74px stage label.
 *  - `"activity"` — `RecentActivityList`: the timeline — a hairline at
 *    `left-[22px]`, an 11px dot per row (filled for the newest), rows with
 *    `HOME_ACTIVITY_ROW_LAYOUT`, and a label + 44px time on the right.
 *
 * Pass the same `rows` count the real list renders (`lib/home/limits.ts`).
 */
export function HomeListSkeleton({
  rows,
  variant = "recommended",
  tone = "page",
  baseDelay = 0,
}: HomeSkeletonProps & { rows: number; variant?: HomeListSkeletonVariant }) {
  const s = HOME_SKELETON_SURFACE[tone];
  const rowDelay = (index: number) => baseDelay + 30 + index * 30;

  if (variant === "activity") {
    return (
      <div aria-hidden="true" className={`relative overflow-hidden py-1.5 ${s.panel}`}>
        <span
          aria-hidden="true"
          className={`absolute bottom-[22px] left-[22px] top-[22px] w-px ${s.hairline}`}
        />
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="relative">
            <span
              aria-hidden="true"
              className={`absolute left-[17px] top-1/2 -mt-[5px] h-[11px] w-[11px] rounded-full ${
                index === 0 ? s.dotActive : s.dot
              }`}
            />
            <div className={HOME_ACTIVITY_ROW_LAYOUT}>
              <div className="min-w-0 flex-1">
                <SkeletonLine height={lineHeightPx(13)}>
                  <HomeSkeletonBlock
                    tone={tone}
                    className={`h-3 ${TITLE_WIDTHS[index % TITLE_WIDTHS.length]}`}
                    delayMs={rowDelay(index)}
                  />
                </SkeletonLine>
                <SkeletonLine height={lineHeightPx(12)}>
                  <HomeSkeletonBlock
                    tone={tone}
                    className="h-2.5 w-1/4"
                    delayMs={rowDelay(index) + 15}
                  />
                </SkeletonLine>
              </div>
              <div className="flex flex-none items-center gap-3.5">
                <SkeletonLine height={lineHeightPx(12)}>
                  <HomeSkeletonBlock
                    tone={tone}
                    className="h-3 w-16"
                    delayMs={rowDelay(index) + 20}
                  />
                </SkeletonLine>
                <SkeletonLine height={lineHeightPx(11.5)} className="min-w-[44px] justify-end">
                  <HomeSkeletonBlock
                    tone={tone}
                    className="h-2.5 w-8"
                    delayMs={rowDelay(index) + 25}
                  />
                </SkeletonLine>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div aria-hidden="true">
      {variant === "mine" ? (
        <SkeletonLine height={lineHeightPx(12)} className="mb-2">
          <HomeSkeletonBlock tone={tone} className="h-3 w-56" delayMs={baseDelay} />
        </SkeletonLine>
      ) : null}

      <div className={s.list}>
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className={HOME_ROW_LAYOUT}>
            <div className="min-w-0 sm:flex-1">
              <SkeletonLine height={lineHeightPx(13)}>
                <HomeSkeletonBlock
                  tone={tone}
                  className={`h-3 ${TITLE_WIDTHS[index % TITLE_WIDTHS.length]}`}
                  delayMs={rowDelay(index)}
                />
              </SkeletonLine>
              <SkeletonLine height={lineHeightPx(12)}>
                <HomeSkeletonBlock
                  tone={tone}
                  className={`h-2.5 ${variant === "mine" ? "w-2/5" : "w-1/4"}`}
                  delayMs={rowDelay(index) + 15}
                />
              </SkeletonLine>
            </div>

            {variant === "recommended" ? (
              <SkeletonLine height={lineHeightPx(12)}>
                <HomeSkeletonBlock
                  tone={tone}
                  className="h-3 w-28"
                  delayMs={rowDelay(index) + 25}
                />
              </SkeletonLine>
            ) : (
              <div className="flex flex-none items-center gap-2.5">
                <HomeSkeletonBlock
                  tone={tone}
                  className="h-[3px] w-[57px] flex-none"
                  delayMs={rowDelay(index) + 20}
                />
                <SkeletonLine height={lineHeightPx(12)} className="sm:min-w-[74px] sm:justify-end">
                  <HomeSkeletonBlock
                    tone={tone}
                    className="h-3 w-14"
                    delayMs={rowDelay(index) + 25}
                  />
                </SkeletonLine>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
