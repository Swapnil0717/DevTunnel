import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintUrlStepBody, BlueprintWizardShell } from "@/components/ui/blueprint-wizard";
import {
  PROJECT_ONBOARDING_SHELL,
  REPOSITORY_STEP_COPY,
} from "@/components/ui/wizard-skeleton-copy";

/**
 * `/admin/projects/new` — `ProjectOnboardingWizard` on step 1,
 * `RepositoryStep`: heading, intro, and the GitHub URL field with its
 * "Fetch repository" button (the import card only appears after a fetch).
 */
export default function AdminProjectOnboardingLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A2.1 — Project onboarding"
      revLabel="Rev — preparing wizard"
      contentClassName="w-full"
      ariaHidden
    >
      <BlueprintWizardShell copy={PROJECT_ONBOARDING_SHELL}>
        <BlueprintUrlStepBody copy={REPOSITORY_STEP_COPY} />
      </BlueprintWizardShell>
    </BlueprintSheet>
  );
}
