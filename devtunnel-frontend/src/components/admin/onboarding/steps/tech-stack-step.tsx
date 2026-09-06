"use client";

import { useId } from "react";
import { TagInput } from "@/components/onboarding/tag-input";
import { TechIcon } from "@/components/onboarding/tech-icon";
import type { OnboardingTechStack } from "@/lib/admin/project-onboarding/types";

interface TechStackStepProps {
  value: OnboardingTechStack;
  onChange: (next: OnboardingTechStack) => void;
  isDetecting: boolean;
}

interface TechStackField {
  key: keyof Omit<OnboardingTechStack, "packageManager">;
  label: string;
  placeholder: string;
}

/**
 * Step 3 of Project Onboarding — "Project Tech Stack"
 * (admin_workflow.txt, "Step 3 — Project Tech Stack").
 *
 * On entry, `ProjectOnboardingWizard` calls `detectTechStack` so every
 * field here starts pre-filled from repository analysis (dependency
 * files, config, source structure) — never a blank form the Admin fills
 * in from scratch. "The Admin should be able to review and correct
 * detected values... but the default values must come from repository
 * analysis" is exactly what this component does: each category renders
 * as an editable `TagInput` (chip add/remove) seeded with the detected
 * list, reusing the same chip control the contributor onboarding wizard
 * uses for its Technologies field rather than inventing a second one.
 */
const FIELDS: TechStackField[] = [
  { key: "languages", label: "Language", placeholder: "e.g. TypeScript" },
  { key: "frontend", label: "Frontend", placeholder: "e.g. React" },
  { key: "backend", label: "Backend", placeholder: "e.g. Node.js" },
  { key: "frameworks", label: "Framework", placeholder: "e.g. Express" },
  { key: "databases", label: "Database", placeholder: "e.g. PostgreSQL" },
  { key: "libraries", label: "Libraries", placeholder: "e.g. Prisma" },
  { key: "buildTools", label: "Build tools", placeholder: "e.g. Vite" },
];

export function TechStackStep({ value, onChange, isDetecting }: TechStackStepProps) {
  const packageManagerId = useId();

  function setField(key: TechStackField["key"], next: string[]) {
    onChange({ ...value, [key]: next });
  }

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Project tech stack</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        Detected automatically from the repository&apos;s dependency files and
        structure. Review the results and correct anything that looks
        wrong before continuing.
      </p>

      {isDetecting ? (
        <p className="m-0 mb-5 text-[12.5px] text-text-dim">Analyzing repository…</p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <TagInput
            key={field.key}
            label={field.label}
            variant="tech"
            values={value[field.key]}
            onChange={(next) => setField(field.key, next)}
            placeholder={field.placeholder}
            renderIcon={(tech) => <TechIcon name={tech} />}
          />
        ))}
      </div>

      <div className="mt-4">
        <label htmlFor={packageManagerId} className="mb-1.5 block text-[11.5px] text-text-muted">
          Package manager
        </label>
        <input
          id={packageManagerId}
          type="text"
          value={value.packageManager ?? ""}
          onChange={(event) =>
            onChange({ ...value, packageManager: event.target.value || null })
          }
          placeholder="e.g. npm, pnpm, pip, cargo"
          className="w-full max-w-[280px] rounded-md border border-border bg-surface px-3 py-2 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        />
      </div>
    </div>
  );
}