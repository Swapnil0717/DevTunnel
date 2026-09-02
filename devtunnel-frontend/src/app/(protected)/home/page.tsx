import type { Metadata } from "next";
import { WelcomeBanner } from "@/components/home/welcome-banner";
import { EntryActions } from "@/components/home/entry-actions";
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
 */
export default async function HomePage() {
  return (
    <main className="flex-1 px-6 py-5 sm:px-[26px] sm:py-[22px] min-w-0">
      <h1 className="sr-only">Contributor home</h1>
      <WelcomeBanner />
      <EntryActions />
      <RecommendedProjectsSection />
      <ActiveContributionsSection />
      <TasksSection />
    </main>
  );
}