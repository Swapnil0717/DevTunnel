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

export const metadata: Metadata = {
  title: "Home | DevTunnel",
  robots: { index: false, follow: false },
};

/**
 * Sign-in → onboarding → home flow (devtunnel_workflow.txt, Module C1):
 * the "not yet onboarded" redirect used to live here as a page-level
 * safety net. It's now enforced once, for every route in this group, by
 * `(protected)/layout.tsx` — so it also covers /profile and any other
 * protected page, not just a direct hit on /home. See
 * lib/onboarding/needs-onboarding.ts for the actual check.
 *
 * Content is capped at max-w-[1040px] and centered — without it, on a
 * wide monitor the sidebar's fixed 208px leaves the rest of the row to
 * stretch the three-column project grid far wider than it was designed
 * for, which reads as empty/unfinished rather than intentional.
 *
 * Order: greeting → `JourneyCard` (what's my progress, what do I do
 * next) → `TaskStats` → recommended projects → recommended/your tasks →
 * recently active projects. The journey card now owns the "what should I
 * do next" job the old `EntryActions` two-card grid used to: one of
 * those two cards ("Start an open source project") never linked anywhere
 * real (`built: false`, no contributor-facing page exists), and the
 * other ("Find an open source project") is exactly the journey card's
 * own `/projects?intent=find` CTA. The journey card's single, state-aware
 * CTA replaces both without ever offering a dead link.
 */
export default async function HomePage() {
  return (
    <main className="flex-1 min-w-0 px-4 py-5 sm:px-[26px] sm:py-[22px]">
      <div className="mx-auto w-full max-w-[1040px]">
        <h1 className="sr-only">Contributor home</h1>
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
    </main>
  );
}