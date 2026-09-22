import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintWizardLayout } from "@/components/ui/blueprint-kit";

const STEP_LABELS = ["Tool URL", "Description", "Labels", "Setup & usage", "Preview & confirm"];

/**
 * `/admin/opensource-tools/new` — `OpenSourceToolOnboardingWizard`'s
 * two-panel layout, not the `/admin/opensource-tools` list page it used
 * to borrow its loading state from.
 */
export default function AdminOpenSourceToolOnboardingLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 04.1 — Tool onboarding"
      revLabel="Rev — preparing wizard"
      contentClassName="w-full"
      ariaHidden
    >
      <BlueprintWizardLayout stepLabels={STEP_LABELS} currentStep={1} />
    </BlueprintSheet>
  );
}
