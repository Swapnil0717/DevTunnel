import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintWizardLayout } from "@/components/ui/blueprint-kit";

const STEP_LABELS = ["Repository", "Description", "Tech stack", "Preview", "Validation"];

/**
 * `/admin/projects/new` — `ProjectOnboardingWizard`'s two-panel layout
 * (sidebar step rail + centered step content), not the `/admin/projects`
 * list page it used to borrow its loading state from.
 */
export default function AdminProjectOnboardingLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A2.1 — Project onboarding"
      revLabel="Rev — preparing wizard"
      contentClassName="w-full"
      ariaHidden
    >
      <BlueprintWizardLayout stepLabels={STEP_LABELS} currentStep={1} />
    </BlueprintSheet>
  );
}
