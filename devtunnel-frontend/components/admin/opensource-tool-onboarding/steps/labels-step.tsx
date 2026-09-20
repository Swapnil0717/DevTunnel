"use client";

import { TagInput } from "@/components/onboarding/tag-input";
import type { OnboardingToolLabels } from "@/lib/admin/opensource-tool-onboarding/types";

interface LabelsStepProps {
  value: OnboardingToolLabels;
  onChange: (next: OnboardingToolLabels) => void;
}

/**
 * Suggested chips only — a starting point to speed up tagging, never a
 * closed list. Clicking one adds it to `value.values` exactly like
 * typing it into the `TagInput` would; the Admin can still type any
 * label that isn't here (Frontend_Development_Rules.txt rule 58/59 —
 * this frontend never restricts the Admin to a fixed enum for
 * open-ended, judgment-based data).
 */
const SUGGESTED_LABELS = [
  "Frontend developer",
  "Backend developer",
  "Full-stack developer",
  "DevOps",
  "Data science",
  "Machine learning",
  "Mobile developer",
  "Designer",
  "Student",
  "Open source maintainer",
  "Security",
  "QA / Testing",
];

/**
 * Step 3 of Open Source Tool Onboarding — "Labels".
 *
 * Reuses `TagInput` (components/onboarding/tag-input.tsx) as-is — the
 * same chip-entry control already used for Skills/Technologies/Interests
 * on the contributor onboarding profile step. The `"interest"` color
 * variant is the closest existing semantic match: like a contributor's
 * interests, a tool's labels describe an audience/affinity rather than a
 * hard skill (`"skill"`) or a specific technology (`"tech"`).
 *
 * Every label in `value.values` is either typed by the Admin or clicked
 * from `SUGGESTED_LABELS` below — nothing is inferred from the fetched
 * README, description, or primary language from Step 1.
 */
export function LabelsStep({ value, onChange }: LabelsStepProps) {
  function addSuggested(label: string) {
    if (!value.values.includes(label)) {
      onChange({ values: [...value.values, label] });
    }
  }

  const remainingSuggestions = SUGGESTED_LABELS.filter(
    (label) => !value.values.includes(label),
  );

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Labels</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        Tag the roles and fields that benefit from this tool — this drives
        filtering and recommendations on the open source tools catalog.
        Add at least one label.
      </p>

      <TagInput
        label="Who benefits from this tool"
        variant="interest"
        values={value.values}
        onChange={(values) => onChange({ values })}
        placeholder="Type a role or field and press Enter…"
      />

      {remainingSuggestions.length > 0 ? (
        <div className="mt-4">
          <p className="m-0 mb-2 text-[11.5px] text-text-faint">Suggestions</p>
          <div className="flex flex-wrap gap-1.5">
            {remainingSuggestions.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => addSuggested(label)}
                className="rounded-md border border-border-subtle bg-surface px-2.5 py-1 text-[11.5px] text-text-muted transition-colors hover:border-border hover:text-text"
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}