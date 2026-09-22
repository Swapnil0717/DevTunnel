import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintWizardLayout } from "@/components/ui/blueprint-kit";

const STEP_LABELS = ["Repository URL", "Description & tech", "Preview & confirm"];

/**
 * `/submissions/new` — `SubmissionOnboardingWizard`'s two-panel layout
 * (3 steps, vs. 5 for the admin onboarding wizards), matching the shared
 * shell every onboarding wizard renders (see `BlueprintWizardLayout`).
 */
export default function SubmitToCommunityLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 11.2 — Submit"
      revLabel="Rev — preparing wizard"
      contentClassName="w-full"
      ariaHidden
    >
      <BlueprintWizardLayout stepLabels={STEP_LABELS} currentStep={1} />
    </BlueprintSheet>
  );
}
