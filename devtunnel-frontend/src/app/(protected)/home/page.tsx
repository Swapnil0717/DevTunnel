import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeHeader } from "@/components/home/home-header";
import { WelcomeBanner } from "@/components/home/welcome-banner";
import { JourneyCard } from "@/components/home/journey-card";
import { TaskStats } from "@/components/home/task-stats";
import { JourneySkeleton } from "@/components/home/journey-skeleton";
import { RecommendedProjectsSection } from "@/components/home/recommended-projects-section";
import { ActiveContributionsSection } from "@/components/home/active-contributions-section";
import { TasksSection } from "@/components/home/tasks-section";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";
import HomeLoading from "./loading";

// A signed-in, per-person screen: never indexable (rule 18). The root layout's
// title template already appends " | DevTunnel", so this is just "Home" — the
// old "Home | DevTunnel" rendered as "Home | DevTunnel | DevTunnel".
export const metadata: Metadata = {
  title: "Home",
  robots: { index: false, follow: false },
};

/**
 * Sign-in → onboarding → home flow (devtunnel_workflow.txt, Module C1): the
 * "not yet onboarded" redirect is enforced once, for every route in this
 * group, by `(protected)/layout.tsx` — so it also covers /profile and any
 * other protected page, not just a direct hit on /home. See
 * lib/onboarding/needs-onboarding.ts for the actual check.
 *
 * Layout follows devtunnel_user_home_redesign.html. Content is capped at
 * max-w-[1040px] and centered — without it, on a wide monitor the sidebar's
 * fixed 208px leaves the rest of the row to stretch the project grid far
 * wider than it was designed for, which reads as empty/unfinished rather than
 * intentional.
 *
 * Order: date + profile → "Welcome back" (the page's only `<h1>`) →
 * `JourneyCard` (what's my progress, what do I do next) → `TaskStats` →
 * recommended projects → recommended/your tasks → recent activity. The
 * journey card owns the "what should I do next" job with one state-aware CTA,
 * so Home never offers a dead link.
 *
 * `tnum` (tabular figures) and `cv11` (Inter's single-storey "a") are the
 * design's font features, applied once here so every number on the page —
 * counts, percentages, times — lines up.
 */
export default async function HomePage() {
  return (
    <main
      className="relative isolate min-w-0 flex-1 px-4 py-6 sm:px-7 sm:pb-8 sm:pt-7"
      style={{ fontFeatureSettings: '"tnum", "cv11"' }}
    >
      {/* `relative` above + `inline` here make BlueprintReveal's
          `absolute inset-0` overlay line up exactly with the area
          `home/loading.tsx`'s blueprint sheet covered, rather than the
          whole viewport. The overlay paints that same loading sheet
          (`skeleton`) so the wipe starts from the frame the loading
          screen left off on — see blueprint-reveal.tsx. */}
      <BlueprintReveal inline skeleton={<HomeLoading />}>
        <div className="mx-auto w-full max-w-[1040px]">
          <HomeHeader />
          <WelcomeBanner />
          <Suspense fallback={<JourneySkeleton />}>
            <JourneyCard />
            <TaskStats />
          </Suspense>
          <RecommendedProjectsSection />
          <TasksSection />
          <ActiveContributionsSection />
        </div>
      </BlueprintReveal>
    </main>
  );
}
