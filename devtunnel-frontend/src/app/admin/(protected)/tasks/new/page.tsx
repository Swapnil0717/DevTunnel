import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { TaskOnboardingWizard } from "@/components/admin/task-onboarding/task-onboarding-wizard";

export const metadata: Metadata = buildMetadata({
  title: "Create task",
  description: "Turn a GitHub issue into a DevTunnel task through the mandatory task onboarding flow.",
  path: "/admin/tasks/new",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/tasks/new` (admin_workflow.txt, section 29, row A13 — "Task
 * Onboarding").
 *
 * Per section 29's "Important UI implementation detail", the mandatory
 * onboarding steps are a single wizard at this one route, with the
 * backend independently validating each step as the Admin moves through
 * it. `TaskOnboardingWizard` owns all of that step state; this file only
 * needs to authenticate the route (via `admin/(protected)/layout.tsx`,
 * already covering everything under `/admin`) and set page metadata.
 */
export default function AdminTaskOnboardingPage() {
  return <TaskOnboardingWizard />;
}