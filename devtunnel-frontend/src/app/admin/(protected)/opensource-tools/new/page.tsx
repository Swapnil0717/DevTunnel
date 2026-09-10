import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { OpenSourceToolOnboardingWizard } from "@/components/admin/opensource-tool-onboarding/opensource-tool-onboarding-wizard";

export const metadata: Metadata = buildMetadata({
  title: "Add Open Source Tool",
  description: "Add a new open source tool to the DevTunnel catalog.",
  path: "/admin/opensource-tools/new",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/opensource-tools/new` — Open Source Tools section, "Add Open
 * Source Tool" (see `admin-nav-items.ts`). Where an admin adds a new open
 * source tool to the catalog shown at `/admin/opensource-tools`.
 *
 * Same shape as `/admin/projects/new` (`AdminProjectOnboardingPage`):
 * `OpenSourceToolOnboardingWizard` owns all step state and already talks
 * to the real `POST/PATCH/GET /admin/opensource-tools/onboarding/*`
 * routes (src/routes/opensourceToolOnboarding.ts, mounted in
 * routes/admin/index.ts) via `lib/admin/opensource-tool-onboarding/api.ts`
 * — this file only authenticates the route (via
 * `admin/(protected)/layout.tsx`) and sets page metadata. Previously this
 * rendered a `SectionMessage` placeholder because no backend route
 * existed yet (Frontend_Development_Rules.txt rule 26); that's no longer
 * true, so the honest-degrade placeholder is retired in favor of the
 * real wizard.
 */
export default function AdminAddOpenSourceToolPage() {
  return <OpenSourceToolOnboardingWizard />;
}
