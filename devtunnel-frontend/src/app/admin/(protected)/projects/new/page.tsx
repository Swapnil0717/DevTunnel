import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { ProjectOnboardingWizard } from "@/components/admin/onboarding/project-onboarding-wizard";

export const metadata: Metadata = buildMetadata({
  title: "Project onboarding",
  description:
    "Import a GitHub repository and curate its DevTunnel project representation.",
  path: "/admin/projects/new",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/projects/new` (admin_workflow.txt, section 29, row A4 — "Project
 * Onboarding — Repository").
 *
 * Per section 29's "Important UI implementation detail", the 5 mandatory
 * onboarding steps (Repository → Description → Tech Stack → Preview →
 * Validation) are **not** 5 separate URL pages — they're a single wizard
 * at this one route, with the backend independently validating each step
 * as the Admin moves through it. `ProjectOnboardingWizard` owns all of
 * that step state; this file only needs to authenticate the route (via
 * `admin/(protected)/layout.tsx`, already covering everything under
 * `/admin`) and set page metadata.
 */
export default function AdminProjectOnboardingPage() {
  return <ProjectOnboardingWizard />;
}