import { OptionCard } from "../option-card";
import {
  CONTRIBUTOR_INTENT_LABEL,
  type ContributorIntent,
  type OnboardingData,
} from "@/lib/onboarding/types";

interface IntentStepProps {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
}

const INTENTS = Object.keys(CONTRIBUTOR_INTENT_LABEL) as ContributorIntent[];

const INTENT_DESCRIPTION: Record<ContributorIntent, string> = {
  START_PROJECT: "Publish your own project and invite others to contribute.",
  FIND_PROJECT: "Browse existing projects and pick up open tasks.",
};

/**
 * Contributor-initiated project creation is disabled: the Admin Portal
 * Master Coding Specification makes Project Onboarding an Admin-only,
 * multi-step, mandatory-validation workflow ("GitHub remains the source
 * of truth for the repository. Admin is responsible for creating and
 * managing the DevTunnel representation of that repository") — there is
 * no path anymore for a contributor to publish a project directly from
 * onboarding. Kept as a data-driven set (rather than deleting
 * `START_PROJECT` from `ContributorIntent`) so re-enabling it later, if
 * that ever changes, is a one-line flip here — same convention as
 * `AdminNavLink.built` in components/admin/admin-nav-items.ts.
 */
const DISABLED_INTENTS: Partial<Record<ContributorIntent, boolean>> = {
  START_PROJECT: true,
};

/**
 * Onboarding step 3 of 4: which of the two Contributor Home entry points
 * (devtunnel_workflow.txt, Module 3 — "Start an Open Source Project" /
 * "Find an Open Source Project") the person wants to see first. This is
 * a starting preference, not a permanent choice — both actions stay
 * available afterwards.
 *
 * "Start an open source project" renders as a visible but disabled
 * "Soon" option rather than being removed from the screen entirely: the
 * person should still understand project creation exists and is coming,
 * not wonder why the choice they expected is simply missing. Only "Find
 * an open source project" can actually be selected right now, so
 * `OnboardingWizard`'s `canContinue` check (which just requires
 * `data.intent` to be set) naturally only advances once that one is
 * picked.
 *
 * The two options sit in a single stacked column on mobile (each full
 * width, easy to tap) and side by side from `sm:` up — on a laptop-width
 * content column a single-file list of two items reads as an
 * accidentally-narrow mobile view, so putting them shoulder to shoulder
 * makes it a real two-choice decision screen instead.
 */
export function IntentStep({ data, onChange }: IntentStepProps) {
  return (
    <div className="py-2">
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text sm:text-[15px]">
        How do you want to get started?
      </h1>
      <p className="m-0 mb-[18px] text-[12.5px] text-text-muted">
        You can always do both later — this just sets your home page.
      </p>

      <div
        role="radiogroup"
        aria-label="How do you want to get started?"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {INTENTS.map((intent) => {
          const disabled = Boolean(DISABLED_INTENTS[intent]);
          return (
            <OptionCard
              key={intent}
              label={CONTRIBUTOR_INTENT_LABEL[intent]}
              description={INTENT_DESCRIPTION[intent]}
              selected={data.intent === intent}
              onSelect={() => onChange({ intent })}
              disabled={disabled}
            />
          );
        })}
      </div>
    </div>
  );
}