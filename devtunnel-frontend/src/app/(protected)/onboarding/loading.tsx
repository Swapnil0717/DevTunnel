import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintWelcomeStepBody, BlueprintWizardShell } from "@/components/ui/blueprint-wizard";
import { USER_ONBOARDING_SHELL } from "@/components/ui/wizard-skeleton-copy";

/**
 * `/onboarding` — `getServerUser()` runs before the page can redirect or
 * render `OnboardingWizard`, which opens on `WelcomeStep` (avatar,
 * heading, intro, "Imported from GitHub" badge). The sheet is that exact
 * screen: the wizard's sidebar rail with its step descriptions and
 * "Signed in as" footnote, the welcome body, and the Back/Continue row.
 */
export default function OnboardingLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 02 — Onboarding"
      revLabel="Rev — preparing your setup"
      contentClassName="w-full"
      ariaHidden
    >
      <BlueprintWizardShell copy={USER_ONBOARDING_SHELL}>
        <BlueprintWelcomeStepBody />
      </BlueprintWizardShell>
    </BlueprintSheet>
  );
}
