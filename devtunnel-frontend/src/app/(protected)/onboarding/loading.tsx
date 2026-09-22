import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintWizardLayout } from "@/components/ui/blueprint-kit";

const STEP_LABELS = ["Welcome", "Your profile", "Get started", "Review"];

/**
 * `/onboarding` — calls `getServerUser()` before it can decide whether
 * to redirect (already onboarded → `/home`, signed out → `/login`) or
 * render `OnboardingWizard`, which shares the exact same two-panel
 * shell as the admin/submission onboarding wizards (sidebar step rail
 * + centered step content) — see `BlueprintWizardLayout`. Previously
 * this rendered a generic progress-dots-and-box shape instead of that
 * sidebar, so the real page's layout shifted the moment it mounted.
 */
export default function OnboardingLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 02 — Onboarding"
      revLabel="Rev — preparing your setup"
      contentClassName="w-full"
      ariaHidden
    >
      <BlueprintWizardLayout stepLabels={STEP_LABELS} currentStep={1} />
    </BlueprintSheet>
  );
}
