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
 * Renders the `OpenSourceToolOnboardingWizard` — mirrors how
 * `/admin/projects/new` renders `ProjectOnboardingWizard`. Being built
 * one step at a time: only Step 1 (Tool URL) is wired to a real API call
 * so far — see the wizard component for what's still a placeholder.
 */
export default function AdminAddOpenSourceToolPage() {
  return <OpenSourceToolOnboardingWizard />;
}