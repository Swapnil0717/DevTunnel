"use client";

import { useId } from "react";
import { OptionCard } from "@/components/onboarding/option-card";
import { TagInput } from "@/components/onboarding/tag-input";
import { TechPicker } from "@/components/onboarding/tech-picker";
import { TechIcon } from "@/components/onboarding/tech-icon";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import type {
  SubmissionDescriptionChoice,
  SubmissionDraftDetails,
  SubmissionDraftSource,
} from "@/lib/submissions/types";

/**
 * Step 2 — "Description and tech stack".
 *
 * Three things on one step, because they're the three things a browser
 * of the list filters and reads by, and splitting them into three steps
 * would turn a two-minute submission into a five-screen form.
 *
 * **Description.** Same two-choice shape as both admin onboarding flows:
 * GitHub's description and README are shown as they are and are never
 * rewritten; a custom description is layered alongside them. That's why
 * the README panel is always visible here rather than hidden behind the
 * CUSTOM choice — it's context for writing, not an alternative to it.
 *
 * **Tech stack.** Pre-filled with what the backend detected from the
 * repository, and fully editable: detection is a starting point, not an
 * answer, and the submitter knows what the thing is actually built with.
 * `TagInput` + `TechPicker` are reused from contributor onboarding
 * rather than reimplemented (rule 51).
 *
 * **Alternative to paid software.** The one classification the list
 * filters on that nothing can detect. It's opt-in, and naming at least
 * one product is required when it's on — a bare "alternative to paid
 * software" badge with nothing behind it is a claim the card can't show
 * and the filter can't justify (rule 38).
 *
 * Also the body of the edit page for a published submission
 * (`EditSubmissionForm`), which offers the same three things. Two
 * optional props let it reuse this step without wrong copy: `showHeading`
 * hides the wizard's own title (the edit page has its own), and
 * `techStackHint` replaces the "Detected from the repository" line — on
 * an edit the current tags are the submitter's choices, not a detection
 * result. Both default to the wizard's behaviour, unchanged.
 */
export function DetailsStep({
  source,
  value,
  onChange,
  showHeading = true,
  techStackHint,
}: {
  source: SubmissionDraftSource;
  value: SubmissionDraftDetails;
  onChange: (next: SubmissionDraftDetails) => void;
  showHeading?: boolean;
  techStackHint?: string;
}) {
  const textareaId = useId();

  function selectChoice(descriptionSource: SubmissionDescriptionChoice) {
    onChange({ ...value, descriptionSource });
  }

  const needsAlternativeNames =
    value.isPaidAlternative && value.alternativeTo.length === 0;

  return (
    <div>
      {showHeading ? (
        <>
          <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Description and tech stack</h1>
          <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
            How this appears on the community list. What GitHub returned is
            never rewritten — a custom description sits alongside it.
          </p>
        </>
      ) : null}

      <section className="mb-6 rounded-[10px] border border-border bg-surface p-5">
        <p className="m-0 mb-1 text-[11px] uppercase tracking-wide text-text-faint">
          From GitHub
        </p>
        <p className="m-0 mb-4 text-[13px] text-text">
          {source.fetchedDescription ?? (
            <span className="text-text-faint">
              This repository has no description on GitHub.
            </span>
          )}
        </p>

        {source.readme ? (
          <>
            <p className="m-0 mb-1 text-[11px] uppercase tracking-wide text-text-faint">README</p>
            <div className="max-h-[220px] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-3">
              <MarkdownReadme content={source.readme} sourceUrl={source.url} />
            </div>
          </>
        ) : null}
      </section>

      <div role="radiogroup" aria-label="Description source" className="flex flex-col gap-2.5">
        <OptionCard
          label="Use the existing description and README"
          description="The community list shows what GitHub returned, exactly as imported."
          selected={value.descriptionSource === "EXISTING"}
          onSelect={() => selectChoice("EXISTING")}
        />
        <OptionCard
          label="Add your own description"
          description="Keep the README, but say in your own words why this is worth a look."
          selected={value.descriptionSource === "CUSTOM"}
          onSelect={() => selectChoice("CUSTOM")}
        />
      </div>

      {value.descriptionSource === "CUSTOM" ? (
        <div className="mt-4">
          <label htmlFor={textareaId} className="mb-1.5 block text-[11.5px] text-text-muted">
            Your description
          </label>
          <textarea
            id={textareaId}
            rows={4}
            maxLength={2000}
            value={value.customDescription ?? ""}
            onChange={(event) => onChange({ ...value, customDescription: event.target.value })}
            placeholder="What is it, and who would want it?"
            className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2.5 text-[13px] leading-[1.5] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </div>
      ) : null}

      <section className="mt-8">
        <h2 className="m-0 mb-1 text-[13.5px] font-medium text-text">Tech stack</h2>
        <p className="m-0 mb-3 text-[12.5px] text-text-muted">
          {techStackHint ??
            (source.detectedTechStack.length > 0
              ? "Detected from the repository. Correct anything that's wrong — this is what people filter by."
              : "Nothing was detected from the repository. Add what it's built with — this is what people filter by.")}
        </p>

        <TagInput
          label="Technologies"
          variant="tech"
          values={value.techStack}
          onChange={(techStack) => onChange({ ...value, techStack })}
          placeholder="Add a technology and press Enter"
          renderIcon={(tech) => <TechIcon name={tech} />}
        />
        <TechPicker
          values={value.techStack}
          onChange={(techStack) => onChange({ ...value, techStack })}
        />

        {value.techStack.length === 0 ? (
          <p className="m-0 mt-2 text-[11.5px] text-text-faint">
            Add at least one — a submission with no tags is invisible to every filter.
          </p>
        ) : null}
      </section>

      <section className="mt-8 rounded-[10px] border border-border-subtle bg-surface p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={value.isPaidAlternative}
            onChange={(event) =>
              onChange({
                ...value,
                isPaidAlternative: event.target.checked,
                // Clearing the names with the checkbox keeps the two from
                // disagreeing — an unchecked box with names behind it
                // would publish a claim nothing shows.
                alternativeTo: event.target.checked ? value.alternativeTo : [],
              })
            }
            className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-accent"
          />
          <span>
            <span className="block text-[13px] font-medium text-text">
              This replaces something people pay for
            </span>
            <span className="mt-0.5 block text-[12px] text-text-muted">
              It gets its own filter on the community list, so name what it stands in for.
            </span>
          </span>
        </label>

        {value.isPaidAlternative ? (
          <div className="mt-4">
            <TagInput
              label="Alternative to"
              variant="interest"
              values={value.alternativeTo}
              onChange={(alternativeTo) => onChange({ ...value, alternativeTo })}
              placeholder="Figma, Notion, Postman…"
            />
            {needsAlternativeNames ? (
              <p className="m-0 mt-2 text-[11.5px] text-status-error-label">
                Name at least one product this replaces.
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
