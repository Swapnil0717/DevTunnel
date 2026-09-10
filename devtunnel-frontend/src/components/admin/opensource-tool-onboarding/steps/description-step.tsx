"use client";

import { useId } from "react";
import { OptionCard } from "@/components/onboarding/option-card";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import type {
  OnboardingToolDescription,
  OnboardingToolSource,
  ToolDescriptionChoice,
} from "@/lib/admin/opensource-tool-onboarding/types";

interface DescriptionStepProps {
  source: OnboardingToolSource;
  value: OnboardingToolDescription;
  onChange: (next: OnboardingToolDescription) => void;
}

/**
 * Step 2 of Open Source Tool Onboarding — "Description".
 *
 * Mirrors `DescriptionStep` from Project Onboarding
 * (components/admin/onboarding/steps/description-step.tsx) on purpose:
 * same two-choice shape, same reasoning — the description fetched from
 * the tool's URL is shown as-is and is never rewritten by this step. A
 * custom description only adds DevTunnel-specific context alongside it,
 * the same way a custom project description never overwrites a GitHub
 * README.
 *
 * The one difference from Project Onboarding: `source.readme` is
 * `null` whenever the tool's URL didn't resolve to a GitHub repository
 * (types.ts), so the README panel only renders when there's actually a
 * README to show instead of always claiming "not found."
 *
 * Reuses `OptionCard` for the same reason Project Onboarding does — it's
 * a generic accessible radio control, not tied to any one flow's
 * semantics.
 */
export function DescriptionStep({ source, value, onChange }: DescriptionStepProps) {
  const textareaId = useId();

  function selectChoice(choice: ToolDescriptionChoice) {
    onChange({ ...value, choice });
  }

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Description</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        This is what DevTunnel will show as the tool&apos;s description.
        The fetched description and README are never rewritten — a custom
        description only adds DevTunnel-specific context alongside them.
      </p>

      <section className="mb-6 rounded-[10px] border border-border bg-surface p-5">
        <p className="m-0 mb-1 text-[11px] uppercase tracking-wide text-text-faint">
          Fetched description
        </p>
        <p className="m-0 mb-4 text-[13px] text-text">
          {source.fetchedDescription ?? (
            <span className="text-text-faint">No description found at this URL.</span>
          )}
        </p>

        {source.readme ? (
          <>
            <p className="m-0 mb-1 text-[11px] uppercase tracking-wide text-text-faint">README</p>
            <div className="max-h-[220px] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-3">
              <MarkdownReadme content={source.readme} />
            </div>
          </>
        ) : null}
      </section>

      <div role="radiogroup" aria-label="Description source" className="flex flex-col gap-2.5">
        <OptionCard
          label="Use existing description"
          description="DevTunnel shows the fetched description exactly as imported."
          selected={value.choice === "EXISTING"}
          onSelect={() => selectChoice("EXISTING")}
        />
        <OptionCard
          label="Use existing description and custom description"
          description="Keep the fetched description, but add a DevTunnel-specific one alongside it."
          selected={value.choice === "CUSTOM"}
          onSelect={() => selectChoice("CUSTOM")}
        />
      </div>

      {value.choice === "CUSTOM" ? (
        <div className="mt-4">
          <label htmlFor={textareaId} className="mb-1.5 block text-[11.5px] text-text-muted">
            Custom DevTunnel description
          </label>
          <textarea
            id={textareaId}
            rows={4}
            value={value.customDescription ?? ""}
            onChange={(event) =>
              onChange({ ...value, customDescription: event.target.value })
            }
            placeholder="Describe this tool for DevTunnel users…"
            className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2.5 text-[13px] leading-[1.5] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </div>
      ) : null}
    </div>
  );
}