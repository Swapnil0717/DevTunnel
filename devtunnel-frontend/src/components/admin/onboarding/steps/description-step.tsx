"use client";

import { useId } from "react";
import { OptionCard } from "@/components/onboarding/option-card";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import type {
  DescriptionChoice,
  OnboardingDescription,
  OnboardingRepository,
} from "@/lib/admin/project-onboarding/types";

interface DescriptionStepProps {
  repository: OnboardingRepository;
  value: OnboardingDescription;
  onChange: (next: OnboardingDescription) => void;
}

/**
 * Step 2 of Project Onboarding — "Project Description"
 * (admin_workflow.txt, "Step 2 — Project Description").
 *
 * Shows the GitHub README/description exactly as imported, then gives the
 * Admin the spec's two — and only two — choices: use it as-is, or keep it
 * and layer a custom DevTunnel description on top. There is no third
 * option to edit or replace the README text itself — "Do not overwrite
 * the GitHub README... The custom description is DevTunnel project
 * metadata, not a modification to GitHub."
 *
 * Reuses `OptionCard` from the contributor onboarding wizard: it's a
 * generic labeled radio control, not tied to developer-role/experience
 * semantics, so there's no reason to fork a second copy of the same
 * accessible radio-button component here.
 */
export function DescriptionStep({ repository, value, onChange }: DescriptionStepProps) {
  const textareaId = useId();

  function selectChoice(choice: DescriptionChoice) {
    onChange({ ...value, choice });
  }

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Project description</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        This is what DevTunnel will show as the project&apos;s description.
        The README itself is never modified — a custom description only
        adds DevTunnel-specific context alongside it.
      </p>

      <section className="mb-6 rounded-[10px] border border-border bg-surface p-5">
        <p className="m-0 mb-1 text-[11px] uppercase tracking-wide text-text-faint">
          GitHub description
        </p>
        <p className="m-0 mb-4 text-[13px] text-text">
          {repository.githubDescription ?? (
            <span className="text-text-faint">No description set on GitHub.</span>
          )}
        </p>

        <p className="m-0 mb-1 text-[11px] uppercase tracking-wide text-text-faint">README</p>
        <div className="max-h-[220px] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-3">
          {repository.readme ? (
            <MarkdownReadme content={repository.readme} />
          ) : (
            <p className="m-0 text-[12px] text-text-faint">No README found on the default branch.</p>
          )}
        </div>
      </section>

      <div role="radiogroup" aria-label="Description source" className="flex flex-col gap-2.5">
        <OptionCard
          label="Use existing README and description"
          description="DevTunnel shows the GitHub description and README exactly as imported."
          selected={value.choice === "EXISTING"}
          onSelect={() => selectChoice("EXISTING")}
        />
        <OptionCard
          label="Use existing README and custom description"
          description="Keep the README, but add a DevTunnel-specific description alongside it."
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
            placeholder="Describe this project for DevTunnel contributors…"
            className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2.5 text-[13px] leading-[1.5] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />
        </div>
      ) : null}
    </div>
  );
}