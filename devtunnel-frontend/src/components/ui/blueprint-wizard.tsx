// src/components/ui/blueprint-wizard.tsx
/**
 * Blueprint skeletons for the five onboarding wizards, built to be a
 * line-for-line twin of the real pages at step 1 — replacing the generic
 * `BlueprintWizardLayout` (blueprint-kit.tsx), which only knew the step
 * count and drew a label bar plus one 160px box where every wizard has
 * different content.
 *
 * How the match is guaranteed rather than eyeballed:
 *
 *  - Same markup, same classes. The shell below reuses the real wizard's
 *    `<main>` / `<aside>` / content-column / footer class strings
 *    verbatim (only colour tokens change to blueprint ones), so widths,
 *    paddings, gaps and breakpoints can't drift.
 *  - Real copy, invisible. Every run of text is a `BlueprintGhostText`
 *    (single line, hugs the text) or `BlueprintGhostParagraph` (wraps)
 *    over the wizard's real string — see `wizard-skeleton-copy.ts` — so
 *    line breaks and line-box heights come from the browser, not from a
 *    guessed bar height.
 *  - Real boxes. Inputs, option cards, buttons, project rows and the
 *    welcome badge reuse the real element's padding / border / radius /
 *    font-size, with the label text ghosted inside.
 *
 * Deliberately not here: anything from steps 2+. The page always opens on
 * step 1, so that's what the sheet has to be.
 */

import type { ReactNode } from "react";
import {
  BlueprintFill,
  BlueprintGhostParagraph,
  BlueprintGhostText,
} from "@/components/ui/blueprint-kit";
import {
  PROJECT_SELECTION_STEP_COPY,
  SOURCE_URL_KIND_OPTIONS,
  WELCOME_STEP_COPY,
  WIZARD_BACK_LABEL,
  WIZARD_CONTINUE_LABEL,
  type UrlStepCopy,
  type WizardShellCopy,
} from "@/components/ui/wizard-skeleton-copy";

/** Faint accent-tinted panel + hairline outline: the blueprint stand-in for `border-border bg-surface`. */
const PANEL = "border border-blueprint/25 bg-blueprint/[0.06]";

/**
 * A real button's box (padding, radius, font) with its label ghosted.
 * `filled` = the solid primary button (hatched edge to edge); otherwise
 * the outlined secondary button (hairline border, hatched label only).
 */
function GhostButton({
  label,
  filled = false,
  className = "",
}: {
  label: string;
  filled?: boolean;
  className?: string;
}) {
  if (filled) {
    return (
      <div className={`relative rounded-md text-[13px] font-medium ${className}`} aria-hidden="true">
        <span className="invisible">{label}</span>
        <BlueprintFill className="absolute inset-0 rounded-md" />
      </div>
    );
  }
  return (
    <div
      className={`rounded-md border border-blueprint/25 text-[13px] font-medium ${className}`}
      aria-hidden="true"
    >
      <BlueprintGhostText text={label} />
    </div>
  );
}

/**
 * The two-panel shell every wizard shares: step-rail sidebar + centered
 * step column with the Back/Continue footer. Mirrors the real wizards'
 * JSX, so `children` (the step-1 body) lands exactly where the real
 * step does.
 */
export function BlueprintWizardShell({
  copy,
  children,
}: {
  copy: WizardShellCopy;
  children: ReactNode;
}) {
  const totalSteps = copy.steps.length;

  return (
    <main className="flex min-h-screen w-full flex-col bg-bg lg:flex-row" aria-hidden="true">
      <aside className="flex flex-shrink-0 flex-col gap-6 border-b border-blueprint/25 px-4 py-5 sm:px-6 lg:w-[320px] lg:justify-between lg:gap-0 lg:border-b-0 lg:border-r lg:px-10 lg:py-12 xl:w-[380px]">
        {copy.backLabel ? (
          <div className="inline-flex w-fit items-center gap-1 text-[12px] font-medium lg:mb-4">
            <BlueprintFill className="h-3.5 w-3.5" />
            <BlueprintGhostText text={copy.backLabel} />
          </div>
        ) : null}

        <div className="flex items-center justify-between lg:block">
          {/* Logo: `h-6 w-auto` on a 1643×262 image = 24 × 150.5px. Inline-block so,
              at `lg:block`, it sits on a text baseline exactly like the real <img>. */}
          <span className="inline-block align-baseline">
            <BlueprintFill className="h-6 w-[150.5px]" />
          </span>
          <div className="lg:hidden">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px]">
                <BlueprintGhostText text={`step 1 of ${totalSteps}`} />
              </span>
              <div className="flex gap-1">
                {Array.from({ length: totalSteps }, (_, index) => (
                  <BlueprintFill key={index} className="h-[3px] w-[22px] rounded-sm" />
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <h2 className="m-0 mb-1 text-[19px] font-medium">
            <BlueprintGhostText text={copy.title} />
          </h2>
          <BlueprintGhostParagraph
            text={copy.blurb}
            className="m-0 mb-10 max-w-[260px] text-[13px] leading-[1.6]"
          />
          <ol className="m-0 flex list-none flex-col p-0">
            {copy.steps.map((step, index) => {
              const stepNumber = index + 1;
              const isCurrent = stepNumber === 1;
              return (
                <li key={step.label} className="flex gap-3 pb-7 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-[11px] font-medium ${
                        isCurrent ? "border-blueprint/60" : "border-blueprint/25"
                      }`}
                    >
                      <BlueprintFill className="h-full w-full rounded-full" delayMs={index * 60} />
                    </span>
                    {stepNumber < totalSteps ? (
                      <span className="mt-1 w-px flex-1 bg-blueprint/25" />
                    ) : null}
                  </div>
                  <div className="pt-0.5">
                    <p className="m-0 text-[13px] font-medium">
                      <BlueprintGhostText text={step.label} />
                    </p>
                    <BlueprintGhostParagraph
                      text={step.description}
                      className="m-0 mt-0.5 max-w-[220px] text-[11.5px] leading-[1.5]"
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <BlueprintGhostParagraph
          text={copy.footnote}
          className="m-0 hidden text-[11.5px] lg:block"
        />
      </aside>

      <div className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-10 lg:px-16 lg:py-14 xl:px-20">
        <div className="flex w-full max-w-[720px] flex-col gap-6 sm:gap-8">
          <div className="flex-1">{children}</div>

          <div className="flex items-center justify-between border-t border-blueprint/15 pt-5">
            <GhostButton label={WIZARD_BACK_LABEL} className="px-4 py-2" />
            <GhostButton label={WIZARD_CONTINUE_LABEL} filled className="px-5 py-2" />
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * `/onboarding` step 1 — `WelcomeStep`: avatar, heading, intro and the
 * "Imported from GitHub" badge, centered.
 */
export function BlueprintWelcomeStepBody() {
  return (
    <div className="flex flex-col items-center gap-5 py-6 text-center">
      <BlueprintFill className="h-16 w-16 rounded-full" />

      <div>
        <h1 className="m-0 mb-1.5 text-[16px] font-medium">
          <BlueprintGhostText text={WELCOME_STEP_COPY.heading} />
        </h1>
        <BlueprintGhostParagraph
          text={WELCOME_STEP_COPY.body}
          className="m-0 max-w-[360px] text-[13px] leading-[1.5]"
        />
      </div>

      <div className="flex items-center gap-1.5 rounded-md border border-blueprint/25 px-3 py-1.5 font-mono text-[11px]">
        <BlueprintGhostText text={WELCOME_STEP_COPY.badge} />
      </div>
    </div>
  );
}

/**
 * The URL-entry step shared in shape by `RepositoryStep`, `ToolUrlStep`
 * and `SourceUrlStep`: heading, intro, [optional content], then the
 * label + URL input + fetch button row. `beforeForm` is where the
 * submission wizard's project/tool choice sits.
 */
export function BlueprintUrlStepBody({
  copy,
  beforeForm,
}: {
  copy: UrlStepCopy;
  beforeForm?: ReactNode;
}) {
  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium">
        <BlueprintGhostText text={copy.heading} />
      </h1>
      <BlueprintGhostParagraph
        text={copy.intro}
        className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6]"
      />

      {beforeForm}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="flex-1">
          <div className="mb-1.5 block text-[11.5px]">
            <BlueprintGhostText text={copy.label} />
          </div>
          <div className={`w-full rounded-md px-3 py-2 font-mono text-[12.5px] ${PANEL}`}>
            <BlueprintGhostText text={copy.placeholder} />
          </div>
        </div>
        <GhostButton
          label={copy.button}
          filled
          className="mt-[1px] shrink-0 px-4 py-2 sm:mt-[22px]"
        />
      </div>
    </div>
  );
}

/**
 * `SourceUrlStep`'s "What are you submitting?" pair of `OptionCard`s.
 * The first is drawn selected because the wizard opens on `PROJECT`.
 */
export function BlueprintKindOptionCards() {
  return (
    <div className="mb-5 flex flex-col gap-2.5">
      {SOURCE_URL_KIND_OPTIONS.map((option, index) => (
        <div
          key={option.label}
          className={`w-full rounded-md px-2.5 py-2 text-left text-[12px] ${
            index === 0 ? "border border-blueprint/60 bg-blueprint/[0.06]" : PANEL
          }`}
        >
          <span className="flex items-center justify-between gap-2">
            <BlueprintGhostText text={option.label} className="font-medium" />
          </span>
          <BlueprintGhostParagraph text={option.description} className="mt-0.5 text-[11px]" />
        </div>
      ))}
    </div>
  );
}

/**
 * `/admin/tasks/new` step 1 — `ProjectSelectionStep`: heading, intro,
 * search field, then the radio list of project rows.
 *
 * The real step paints a spinner line until `fetchOnboardingProjects()`
 * resolves and the rows replace it. The sheet draws the rows instead —
 * the shape the step settles into — so the swap from skeleton to page
 * doesn't resize the column twice.
 */
export function BlueprintProjectSelectionStepBody() {
  const copy = PROJECT_SELECTION_STEP_COPY;
  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium">
        <BlueprintGhostText text={copy.heading} />
      </h1>
      <BlueprintGhostParagraph
        text={copy.intro}
        className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6]"
      />

      <div className="relative mb-4">
        {/* Wrapper carries the transform: `.blueprint-fill` animates `transform`
            itself, so a translate on the fill would be overridden. */}
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          <BlueprintFill className="h-3.5 w-3.5" />
        </div>
        <div className={`w-full rounded-[8px] py-2 pl-8 pr-3 text-[12.5px] ${PANEL}`}>
          <BlueprintGhostText text={copy.searchPlaceholder} />
        </div>
      </div>

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {copy.rows.map((row) => (
          <li key={row.repo}>
            <div
              className={`flex w-full items-center justify-between gap-3 rounded-md px-3.5 py-3 text-left ${PANEL}`}
            >
              <span>
                <span className="block text-[13px] font-medium">
                  <BlueprintGhostText text={row.name} />
                </span>
                <span className="mt-0.5 block font-mono text-[11.5px]">
                  <BlueprintGhostText text={row.repo} />
                </span>
              </span>
              <span className="shrink-0 text-[11.5px]">
                <BlueprintGhostText text={row.language} />
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
