import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintUrlStepBody, BlueprintWizardShell } from "@/components/ui/blueprint-wizard";
import {
  TOOL_ONBOARDING_SHELL,
  TOOL_URL_STEP_COPY,
} from "@/components/ui/wizard-skeleton-copy";

/**
 * `/admin/opensource-tools/new` — `OpenSourceToolOnboardingWizard` on
 * step 1, `ToolUrlStep`: heading, intro, and the project URL field with
 * its "Fetch tool" button.
 */
export default function AdminOpenSourceToolOnboardingLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 04.1 — Tool onboarding"
      revLabel="Rev — preparing wizard"
      contentClassName="w-full"
      ariaHidden
    >
      <BlueprintWizardShell copy={TOOL_ONBOARDING_SHELL}>
        <BlueprintUrlStepBody copy={TOOL_URL_STEP_COPY} />
      </BlueprintWizardShell>
    </BlueprintSheet>
  );
}
