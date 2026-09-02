import {
  CONTRIBUTOR_INTENT_LABEL,
  DEVELOPER_ROLE_LABEL,
  EXPERIENCE_LEVEL_LABEL,
  type OnboardingData,
} from "@/lib/onboarding/types";
import { TechIcon } from "../tech-icon";

interface ReviewStepProps {
  data: OnboardingData;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="m-0 text-text">{value}</dd>
    </>
  );
}

function SummaryTagRow({ label, values }: { label: string; values: string[] }) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="m-0 flex flex-wrap gap-1.5 text-text">
        {values.length ? (
          values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1.5 rounded-md border border-tag-tech-border bg-tag-tech-bg px-2 py-0.5 text-[11.5px] text-tag-tech-text"
            >
              <TechIcon name={value} />
              {value}
            </span>
          ))
        ) : (
          <span>None added</span>
        )}
      </dd>
    </>
  );
}

/**
 * Onboarding step 4 of 4: a plain-text summary of what's about to be
 * saved. Only ever reflects values actually entered in earlier steps —
 * never invented defaults (Frontend_Development_Rules.txt rule 49).
 */
export function ReviewStep({ data }: ReviewStepProps) {
  return (
    <div className="py-2">
      <h1 className="m-0 mb-1 text-[15px] font-medium text-text">Review your profile</h1>
      <p className="m-0 mb-[18px] text-[12.5px] text-text-muted">
        Make sure everything looks right before you finish setting up.
      </p>

      <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-3 rounded-[10px] border border-border bg-surface p-5 text-[12.5px] sm:grid-cols-[120px_1fr]">
        <SummaryRow label="Bio" value={data.bio || "Not provided"} />
        <SummaryRow
          label="Skills"
          value={data.skills.length ? data.skills.join(", ") : "None added"}
        />
        <SummaryTagRow label="Technologies" values={data.technologies} />
        <SummaryRow
          label="Developer role"
          value={data.developerRole ? DEVELOPER_ROLE_LABEL[data.developerRole] : "Not set"}
        />
        <SummaryRow
          label="Experience"
          value={data.experienceLevel ? EXPERIENCE_LEVEL_LABEL[data.experienceLevel] : "Not set"}
        />
        <SummaryRow
          label="Interests"
          value={data.interests.length ? data.interests.join(", ") : "None added"}
        />
        <SummaryRow
          label="Getting started"
          value={data.intent ? CONTRIBUTOR_INTENT_LABEL[data.intent] : "Not set"}
        />
      </dl>
    </div>
  );
}