import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
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
 * protection `/dashboard` and `/profile` get. This page re-checks with its
 * own `getServerUser()` call (same pattern as `profile/page.tsx`) purely
 * to get the actual user record to render.
 */
export default async function OnboardingPage() {
  const user = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  return <OnboardingWizard user={user} />;
}
