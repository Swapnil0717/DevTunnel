import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintProjectSelectionStepBody,
  BlueprintWizardShell,
} from "@/components/ui/blueprint-wizard";
import { TASK_ONBOARDING_SHELL } from "@/components/ui/wizard-skeleton-copy";

/**
 * `/admin/tasks/new` — `TaskOnboardingWizard` on step 1,
 * `ProjectSelectionStep`: heading, intro, project search field and the
 * list of selectable project rows.
 */
export default function AdminTaskOnboardingLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A13.1 — Task onboarding"
      revLabel="Rev — preparing wizard"
      contentClassName="w-full"
      ariaHidden
    >
      <BlueprintWizardShell copy={TASK_ONBOARDING_SHELL}>
        <BlueprintProjectSelectionStepBody />
      </BlueprintWizardShell>
    </BlueprintSheet>
  );
}
