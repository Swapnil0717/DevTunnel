import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WelcomeBanner } from "@/components/home/welcome-banner";
import { EntryActions } from "@/components/home/entry-actions";
import { RecommendedProjectsSection } from "@/components/home/recommended-projects-section";
import { ActiveContributionsSection } from "@/components/home/active-contributions-section";
import { TasksSection } from "@/components/home/tasks-section";
import { getServerUser } from "@/lib/auth/get-server-user";
import { needsOnboarding, ONBOARDING_DONE_COOKIE } from "@/lib/onboarding/needs-onboarding";

export const metadata: Metadata = {
  title: "Home | DevTunnel",
  robots: { index: false, follow: false },
};

/**
 * Safety net for the sign-in → onboarding → home flow
 * (devtunnel_workflow.txt, Module C1): OAuthCallbackView already sends a
 * first-time sign-in straight to /onboarding, but this page is what
 * actually decides who's allowed to land here — the same way
 * (protected)/onboarding/page.tsx and profile/page.tsx each independently
 * re-check the session rather than trusting how the person arrived.
 * Covers direct navigation, a bookmarked /home or /dashboard URL, or
 * closing the tab mid-onboarding and coming back later.
 *
 * The `ONBOARDING_DONE_COOKIE` check matters here: right after finishing
 * the wizard, `needsOnboarding(user)` can still read as `true` on its own
 * (same sign-in, so `lastLoginAt` is still close to `createdAt`) — the
 * cookie is what stops that from bouncing a person straight back to
 * /onboarding the moment they land on /home.
 */
export default async function HomePage() {
  const user = await getServerUser();
  const alreadyOnboarded = cookies().has(ONBOARDING_DONE_COOKIE);

  if (user && !alreadyOnboarded && needsOnboarding(user)) {
    redirect("/onboarding");
  }

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