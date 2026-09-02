import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { needsOnboarding, ONBOARDING_DONE_COOKIE } from "@/lib/onboarding/needs-onboarding";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export const metadata: Metadata = buildMetadata({
  title: "Set up your profile",
  description:
    "Tell DevTunnel about your skills, technologies, and interests so we can recommend the right projects.",
  path: "/onboarding",
  // Application UI, not public content — never indexed
  // (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/onboarding` — devtunnel_workflow.txt, Module C1 — Authentication,
 * "User onboarding" screen (3_devtunnel_onboarding.html).
 *
 * Lives inside the `(protected)` route group, so `(protected)/layout.tsx`
 * already guarantees a verified session before this renders — the same
 * protection `/home` and `/profile` get. This page re-checks with its own
 * `getServerUser()` call (same pattern as `profile/page.tsx`), both to get
 * the actual user record to render and to redirect an already-onboarded
 * person straight to /home (see the `needsOnboarding` check below).
 *
 * Reached via components/auth/oauth-callback-view.tsx (which sends a
 * first-time sign-in here) or by (protected)/home/page.tsx's own
 * first-sign-in check bouncing someone back here — see
 * lib/onboarding/needs-onboarding.ts for how "first-time" is determined
 * without any new backend work.
 */
export default async function OnboardingPage() {
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  // Someone who already went through onboarding this sign-in (the
  // ONBOARDING_DONE_COOKIE check — see needs-onboarding.ts) or who was
  // never a first-time sign-in at all (the timestamp check) hitting this
  // URL directly goes straight to /home instead of redoing it.
  const alreadyOnboarded = cookies().has(ONBOARDING_DONE_COOKIE);
  if (alreadyOnboarded || !needsOnboarding(user)) {
    redirect("/home");
  }

  return <OnboardingWizard user={user} />;
}