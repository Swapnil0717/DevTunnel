import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SubmissionOnboardingWizard } from "@/components/submissions/onboarding/submission-onboarding-wizard";

export const metadata: Metadata = buildMetadata({
  title: "Submit a project or tool",
  description: "Add a project or tool you use or built to the DevTunnel community list.",
  path: "/submissions/new",
  // Private application UI, never public content (rule 18).
  noIndex: true,
});

/**
 * `/submissions/new` — the "Submit project or tool" button on
 * `/submissions`.
 *
 * Same shape as `/admin/opensource-tools/new`: the wizard owns every
 * step's state and talks to the real
 * `POST/PUT/GET /submissions/draft/*` routes
 * (devtunnel-backend src/routes/submissions.ts) through
 * `lib/submissions/client-api.ts`. This file only sets metadata; the
 * `(protected)` layout above it handles authentication.
 *
 * Deliberately a full-screen wizard rather than a modal on the list
 * page: step 2 shows the imported README, which needs room, and a
 * refreshed or shared URL should land back in the flow rather than
 * losing it.
 */
export default function SubmitToCommunityPage() {
  return <SubmissionOnboardingWizard />;
}
