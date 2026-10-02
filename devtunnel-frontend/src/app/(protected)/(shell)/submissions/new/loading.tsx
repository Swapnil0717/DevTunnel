import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintKindOptionCards,
  BlueprintUrlStepBody,
  BlueprintWizardShell,
} from "@/components/ui/blueprint-wizard";
import {
  SOURCE_URL_STEP_COPY,
  SUBMISSION_ONBOARDING_SHELL,
} from "@/components/ui/wizard-skeleton-copy";

/**
 * `/submissions/new` — `SubmissionOnboardingWizard` (3 steps) on step 1,
 * `SourceUrlStep`: heading, intro, the "A project" / "A tool" option
 * cards, then the GitHub URL field with its "Fetch repository" button.
 */
export default function SubmitToCommunityLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 11.2 — Submit"
      revLabel="Rev — preparing wizard"
      contentClassName="w-full"
      ariaHidden
    >
      <BlueprintWizardShell copy={SUBMISSION_ONBOARDING_SHELL}>
        <BlueprintUrlStepBody
          copy={SOURCE_URL_STEP_COPY}
          beforeForm={<BlueprintKindOptionCards />}
        />
      </BlueprintWizardShell>
    </BlueprintSheet>
  );
}
