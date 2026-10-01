import {
  HomeSkeletonBlock,
  SkeletonLine,
  lineHeightPx,
  type HomeSkeletonProps,
} from "./skeleton-kit";
import { JourneyCardSkeleton, TaskStatsSkeleton } from "./journey-skeleton";
import { ProjectGridSkeleton } from "./project-grid-skeleton";
import { HomeListSkeleton } from "./home-list-skeleton";
import { HOME_TASKS_GRID } from "./styles";
import { HOME_RECOMMENDED_PROJECT_LIMIT } from "@/lib/home/recommended-projects";
import {
  HOME_MY_TASKS_LIMIT,
  HOME_RECENT_ACTIVITY_LIMIT,
  HOME_RECOMMENDED_TASKS_LIMIT,
} from "@/lib/home/limits";

/**
 * The date + profile row and the "Welcome back" heading — `HomeHeader` and
 * `WelcomeBanner`.
 *
 *  - header: `mb-7`, 30px tall (the avatar sets it); the date is a 12px mono
 *    line (`min-h-[18px]`), the name a 12.5px line, the avatar 30px round;
 *  - heading: 26px with `leading-normal` → a 39px line, then `mb-5`.
 */
function HomeIntroSkeleton({ tone = "page", baseDelay = 0 }: HomeSkeletonProps) {
  return (
    <>
      <div className="mb-7 flex items-center justify-between gap-4">
        <SkeletonLine height={18} className="flex-none">
          <HomeSkeletonBlock tone={tone} className="h-3 w-40" delayMs={baseDelay} />
        </SkeletonLine>
        <div className="flex items-center gap-2.5">
          <SkeletonLine height={lineHeightPx(12.5)}>
            <HomeSkeletonBlock tone={tone} className="h-3 w-24" delayMs={baseDelay + 30} />
          </SkeletonLine>
          <HomeSkeletonBlock
            tone={tone}
            className="h-[30px] w-[30px] flex-none"
            rounded="rounded-full"
            delayMs={baseDelay + 30}
          />
        </div>
      </div>

      <SkeletonLine height={lineHeightPx(26)} className="mb-5">
        <HomeSkeletonBlock
          tone={tone}
          className="h-6 w-72 max-w-full"
          delayMs={baseDelay + 70}
        />
      </SkeletonLine>
    </>
  );
}

/** `SectionHeading`: a 20px row (`mb-3`) — title on the left, "See all →" on the right when the section has somewhere to go. */
function SectionHeadingSkeleton({
  tone = "page",
  baseDelay = 0,
  titleWidth,
  withLink = false,
}: HomeSkeletonProps & { titleWidth: string; withLink?: boolean }) {
  return (
    <div className="mb-3 flex h-5 items-center justify-between gap-3">
      <HomeSkeletonBlock tone={tone} className={`h-3 ${titleWidth}`} delayMs={baseDelay} />
      {withLink ? (
        <HomeSkeletonBlock tone={tone} className="h-3 w-14" delayMs={baseDelay + 20} />
      ) : null}
    </div>
  );
}

/**
 * The whole of Home as a placeholder, in the order `home/page.tsx` renders it:
 * date + profile → "Welcome back" → journey card → stat strip → recommended
 * projects → recommended tasks | your tasks → recently active. Each section is
 * the same skeleton component its own `<Suspense>` fallback uses, so the
 * route-level sheet and the in-page fallbacks cannot disagree with each other
 * or with the page.
 *
 * Wrapped in the same `mx-auto w-full max-w-[1040px]` column as the real page.
 * Section gaps (`mb-7`, `mb-5`, `mb-3`, `mb-9`) live inside the pieces, exactly
 * where the real components put them.
 *
 * `home/loading.tsx` draws this in the blueprint tone; the base delays below
 * make the sheet build top to bottom in reading order.
 */
export function HomePageSkeleton({ tone = "page" }: Pick<HomeSkeletonProps, "tone">) {
  return (
    <div aria-hidden="true" className="mx-auto w-full max-w-[1040px]">
      <HomeIntroSkeleton tone={tone} baseDelay={0} />

      <JourneyCardSkeleton tone={tone} baseDelay={100} />
      <TaskStatsSkeleton tone={tone} baseDelay={260} />

      <section className="mb-9">
        <SectionHeadingSkeleton
          tone={tone}
          baseDelay={340}
          titleWidth="w-[125px]"
          withLink
        />
        <ProjectGridSkeleton
          tone={tone}
          baseDelay={380}
          count={HOME_RECOMMENDED_PROJECT_LIMIT}
        />
      </section>

      <div className={`mb-9 ${HOME_TASKS_GRID}`}>
        <section>
          <SectionHeadingSkeleton tone={tone} baseDelay={520} titleWidth="w-[118px]" />
          <HomeListSkeleton
            tone={tone}
            baseDelay={540}
            variant="recommended"
            rows={HOME_RECOMMENDED_TASKS_LIMIT}
          />
        </section>
        <section>
          <SectionHeadingSkeleton tone={tone} baseDelay={520} titleWidth="w-16" withLink />
          <HomeListSkeleton
            tone={tone}
            baseDelay={540}
            variant="mine"
            rows={HOME_MY_TASKS_LIMIT}
          />
        </section>
      </div>

      <section>
        <SectionHeadingSkeleton tone={tone} baseDelay={720} titleWidth="w-24" withLink />
        <HomeListSkeleton
          tone={tone}
          baseDelay={740}
          variant="activity"
          rows={HOME_RECENT_ACTIVITY_LIMIT}
        />
      </section>
    </div>
  );
}
