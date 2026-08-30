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
 * Onboarding step 3 of 4: which of the two Contributor Home entry points
 * (devtunnel_workflow.txt, Module 3 — "Start an Open Source Project" /
 * "Find an Open Source Project") the person wants to see first. This is
 * a starting preference, not a permanent choice — both actions stay
 * available afterwards.
 */
export function IntentStep({ data, onChange }: IntentStepProps) {
  return (
    <div className="py-2">
      <h1 className="m-0 mb-1 text-[15px] font-medium text-text">
        How do you want to get started?
      </h1>
      <p className="m-0 mb-[18px] text-[12.5px] text-text-muted">
        You can always do both later — this just sets your home page.
      </p>

      <div
        role="radiogroup"
        aria-label="How do you want to get started?"
        className="flex flex-col gap-2.5"
      >
        {INTENTS.map((intent) => (
          <OptionCard
            key={intent}
            label={CONTRIBUTOR_INTENT_LABEL[intent]}
            description={INTENT_DESCRIPTION[intent]}
            selected={data.intent === intent}
            onSelect={() => onChange({ intent })}
          />
        ))}
      </div>
    </div>
  );
}
