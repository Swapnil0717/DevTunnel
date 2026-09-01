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

export default function HomePage() {
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