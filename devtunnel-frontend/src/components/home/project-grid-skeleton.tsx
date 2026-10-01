import {
  HOME_SKELETON_SURFACE,
  HomeSkeletonBlock,
  SkeletonLine,
  elapsedDelay,
  lineHeightPx,
  type HomeSkeletonProps,
} from "./skeleton-kit";
import { HOME_PROJECT_GRID } from "./styles";

/**
 * Placeholder for the recommended-project cards — the same `auto-fit` grid
 * (`HOME_PROJECT_GRID`, so it wraps at exactly the widths the real grid does)
 * and the same card anatomy as `ProjectCard`:
 *
 *  - `p-4`, `gap-3`, panel border;
 *  - header: 28px logo tile beside a 13.5px/1.3 name line over an 11px
 *    `owner/repo` line (34px tall, so it — not the tile — sets the row height);
 *  - description: three 12.5px/1.55 lines, the `line-clamp-3` ceiling;
 *  - footer: `border-t pt-3`, an 18px language line, an 18px "Role — Match: n%"
 *    line and the 2px bar, `gap-2`.
 *
 * ≈217px tall per card, which is what a card with a full description and a
 * match score measures.
 *
 * In the blueprint tone each card also carries the reference's "PLATE 0n"
 * corner flag (top right, clear of the name column).
 */
export function ProjectGridSkeleton({
  count,
  tone = "page",
  baseDelay = 0,
}: HomeSkeletonProps & { count: number }) {
  const s = HOME_SKELETON_SURFACE[tone];

  return (
    <div className={HOME_PROJECT_GRID} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => {
        const d = baseDelay + index * 60;
        return (
          <div key={index} className={`relative flex flex-col gap-3 p-4 ${s.panel}`}>
            {tone === "blueprint" ? (
              <span
                style={{ animationDelay: elapsedDelay(d + 400) }}
                className="blueprint-plate absolute right-1.5 top-1.5 z-10 rounded-[2px] border border-blueprint/40 bg-blueprint/15 px-1 py-px text-[9px] uppercase leading-tight text-blueprint/85"
              >
                Plate {String(index + 1).padStart(2, "0")}
              </span>
            ) : null}

            <div className="flex items-center gap-2.5">
              <HomeSkeletonBlock
                tone={tone}
                className="h-7 w-7 flex-none"
                rounded="rounded-[6px]"
                delayMs={d}
              />
              <div className="min-w-0 flex-1">
                <SkeletonLine height={lineHeightPx(13.5, 1.3)}>
                  <HomeSkeletonBlock tone={tone} className="h-3 w-3/5" delayMs={d + 30} />
                </SkeletonLine>
                <SkeletonLine height={lineHeightPx(11)}>
                  <HomeSkeletonBlock tone={tone} className="h-2.5 w-4/5" delayMs={d + 60} />
                </SkeletonLine>
              </div>
            </div>

            <div className="flex-1">
              {["w-full", "w-full", "w-2/3"].map((width, line) => (
                <SkeletonLine key={line} height={lineHeightPx(12.5, 1.55)}>
                  <HomeSkeletonBlock
                    tone={tone}
                    className={`h-3 ${width}`}
                    delayMs={d + 90 + line * 30}
                  />
                </SkeletonLine>
              ))}
            </div>

            <div className={`flex flex-col gap-2 border-t ${s.ruleSoft} pt-3`}>
              <SkeletonLine height={lineHeightPx(12)} className="gap-1.5">
                <HomeSkeletonBlock
                  tone={tone}
                  className="h-2 w-2 flex-none"
                  rounded="rounded-full"
                  delayMs={d + 190}
                />
                <HomeSkeletonBlock tone={tone} className="h-3 w-16" delayMs={d + 200} />
              </SkeletonLine>
              <SkeletonLine height={lineHeightPx(12)}>
                <HomeSkeletonBlock tone={tone} className="h-3 w-36" delayMs={d + 230} />
              </SkeletonLine>
              <HomeSkeletonBlock tone={tone} className="h-0.5 w-full" delayMs={d + 260} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
