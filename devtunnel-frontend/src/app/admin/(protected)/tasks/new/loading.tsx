import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintWizardLayout } from "@/components/ui/blueprint-kit";

const STEP_LABELS = ["Project", "Issue", "Task details", "Preview", "Validation"];

/**
 * `/admin/tasks/new` — `TaskOnboardingWizard`'s two-panel layout, not
 * the `/admin/tasks` list page it used to borrow its loading state from.
 */
export default function AdminTaskOnboardingLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A13.1 — Task onboarding"
      revLabel="Rev — preparing wizard"
      contentClassName="w-full"
      ariaHidden
    >
      <BlueprintWizardLayout stepLabels={STEP_LABELS} currentStep={1} />
    </BlueprintSheet>
  );
}
