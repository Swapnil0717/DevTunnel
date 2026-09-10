"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/layout/logo";
import { StepIndicator } from "@/components/onboarding/step-indicator";
import {
  completeToolOnboarding,
  fetchToolOnboardingPreview,
  saveToolDescription,
  saveToolLabels,
  ToolOnboardingApiError,
  validateToolOnboarding,
} from "@/lib/admin/opensource-tool-onboarding/api";
import type {
  CreatedOpenSourceTool,
  OnboardingToolDescription,
  OnboardingToolLabels,
  ToolOnboardingDraft,
  ToolOnboardingValidationResult,
} from "@/lib/admin/opensource-tool-onboarding/types";
import { ToolUrlStep } from "./steps/tool-url-step";
import { DescriptionStep } from "./steps/description-step";
import { LabelsStep } from "./steps/labels-step";
import { PreviewConfirmStep } from "./steps/preview-confirm-step";

const TOTAL_STEPS = 4;
const STEP_LABELS = ["Tool URL", "Description", "Labels", "Preview & confirm"];
const STEP_DESCRIPTIONS = [
  "Import the project by its URL.",
  "Choose the DevTunnel description.",
  "Tag who this tool benefits.",
  "Confirm and add the tool.",
];

const DEFAULT_DESCRIPTION: OnboardingToolDescription = {
  choice: "EXISTING",
  customDescription: null,
};

const DEFAULT_LABELS: OnboardingToolLabels = { values: [] };

/**
 * `/admin/opensource-tools/new` — Open Source Tool Onboarding wizard
 * ("Add Open Source Tool" in `admin-nav-items.ts`).
 *
 * Mirrors `ProjectOnboardingWizard` (components/admin/onboarding/) on
 * purpose — same sidebar + step-rail layout, same `StepIndicator`, same
 * Back/Continue footer — so an Admin who already knows Project
 * Onboarding recognizes this flow immediately. 4 steps instead of 5:
 * Tool URL → Description → Labels → Preview & Confirm — one combined
 * final step rather than Project Onboarding's separate Preview and
 * Validation steps, per the original request for a single "preview and
 * confirmation" page. No Tech Stack step — an "open source tool"
 * listing doesn't need contributor-facing tech-stack detection the way
 * a full onboarded project does.
 *
 * Same "persist as you go" convention as Project Onboarding
 * (admin_workflow.txt section 24 — the backend, not this component,
 * owns whether a step is complete): every step is saved to the draft
 * the moment the Admin presses Continue, and `draft` is always replaced
 * with whatever the backend returns. `draft.steps` (the backend's own
 * completion flags) is what actually gates whether "Add tool" can be
 * pressed on Step 4 — this component's local `step` number only
 * controls which step is currently *visible*, never whether the tool is
 * allowed to be created.
 *
 * Nothing here assumes a catalog row exists until `completeToolOnboarding`
 * returns — the tool is not live in the catalog before that point.
 */
export function OpenSourceToolOnboardingWizard() {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ToolOnboardingDraft | null>(null);

  const [description, setDescription] = useState<OnboardingToolDescription>(DEFAULT_DESCRIPTION);
  const [labels, setLabels] = useState<OnboardingToolLabels>(DEFAULT_LABELS);

  const [previewDraft, setPreviewDraft] = useState<ToolOnboardingDraft | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [validation, setValidation] = useState<ToolOnboardingValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const [isSavingStep, setIsSavingStep] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdTool, setCreatedTool] = useState<CreatedOpenSourceTool | null>(null);

  // Step 4 entry: always re-fetch the preview from the backend so it
  // reflects exactly what's stored, not accumulated local state — then
  // immediately run final validation, since this step combines preview
  // and confirmation into one page. Also updates `draft` (not just
  // `previewDraft`), since the preview call is what marks
  // `previewCompleted` true on the backend — the checklist reads
  // `draft.steps`, so without this it would still show Preview as
  // incomplete even after a successful fetch.
  useEffect(() => {
    if (step !== 4 || !draft || createdTool) return;
    setIsLoadingPreview(true);
    setStepError(null);
    fetchToolOnboardingPreview(draft.id)
      .then((next) => {
        setPreviewDraft(next);
        setDraft(next);
        setIsValidating(true);
        return validateToolOnboarding(draft.id);
      })
      .then(setValidation)
      .catch(() => setStepError("Couldn't load the preview. Try going back and forward again."))
      .finally(() => {
        setIsLoadingPreview(false);
        setIsValidating(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on step/draft id change
  }, [step, draft?.id, createdTool]);

  function goBack() {
    setStepError(null);
    setStep((current) => Math.max(1, current - 1));
  }

  async function goNext() {
    if (!draft) return;
    setStepError(null);

    if (step === 2) {
      setIsSavingStep(true);
      try {
        const next = await saveToolDescription(draft.id, description);
        setDraft(next);
        setStep(3);
      } catch (error) {
        setStepError(
          error instanceof ToolOnboardingApiError
            ? "We couldn't save the description. Please try again."
            : "Something went wrong. Check your connection and try again.",
        );
      } finally {
        setIsSavingStep(false);
      }
      return;
    }

    if (step === 3) {
      setIsSavingStep(true);
      try {
        const next = await saveToolLabels(draft.id, labels);
        setDraft(next);
        setStep(4);
      } catch (error) {
        setStepError(
          error instanceof ToolOnboardingApiError
            ? "We couldn't save the labels. Please try again."
            : "Something went wrong. Check your connection and try again.",
        );
      } finally {
        setIsSavingStep(false);
      }
      return;
    }

    setStep((current) => Math.min(TOTAL_STEPS, current + 1));
  }

  async function handleCreate() {
    if (!draft) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const tool = await completeToolOnboarding(draft.id);
      setCreatedTool(tool);
    } catch (error) {
      setCreateError(
        error instanceof ToolOnboardingApiError
          ? "This draft isn't ready to be added yet. Check the steps above."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setIsCreating(false);
    }
  }

  function startAnother() {
    setStep(1);
    setDraft(null);
    setDescription(DEFAULT_DESCRIPTION);
    setLabels(DEFAULT_LABELS);
    setPreviewDraft(null);
    setValidation(null);
    setCreatedTool(null);
    setCreateError(null);
    setStepError(null);
  }

  const canContinue =
    step === 1
      ? Boolean(draft?.source)
      : step === 2
        ? description.choice === "EXISTING" || Boolean(description.customDescription?.trim())
        : step === 3
          ? labels.values.length > 0
          : true;

  return (
    <main className="flex min-h-screen w-full flex-col bg-bg lg:flex-row">
      <aside className="flex flex-shrink-0 flex-col gap-6 border-b border-border-subtle px-4 py-5 sm:px-6 lg:w-[320px] lg:justify-between lg:gap-0 lg:border-b-0 lg:border-r lg:px-10 lg:py-12 xl:w-[380px]">
        <div className="flex items-center justify-between lg:block">
          <Logo asLink={false} />
          <div className="lg:hidden">
            <StepIndicator currentStep={step} totalSteps={TOTAL_STEPS} orientation="horizontal" />
          </div>
        </div>

        <div className="hidden lg:block">
          <h2 className="m-0 mb-1 text-[19px] font-medium text-text">Add open source tool</h2>
          <p className="m-0 mb-10 max-w-[260px] text-[13px] leading-[1.6] text-text-muted">
            Import a project by URL and curate how it appears in the
            DevTunnel open source tools catalog.
          </p>
          <StepIndicator
            currentStep={step}
            totalSteps={TOTAL_STEPS}
            orientation="vertical"
            labels={STEP_LABELS}
            descriptions={STEP_DESCRIPTIONS}
          />
        </div>

        <p className="m-0 hidden text-[11.5px] text-text-faint lg:block">
          Nothing is added to the catalog until every step is confirmed.
        </p>
      </aside>

      <div className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-10 lg:px-16 lg:py-14 xl:px-20">
        <div className="flex w-full max-w-[720px] flex-col gap-6 sm:gap-8">
          <div className="flex-1">
            {step === 1 && (
              <ToolUrlStep
                draft={draft}
                onImported={(next) => {
                  setDraft(next);
                  setDescription(next.description ?? DEFAULT_DESCRIPTION);
                  setLabels(next.labels ?? DEFAULT_LABELS);
                }}
              />
            )}

            {step === 2 && draft?.source && (
              <DescriptionStep
                source={draft.source}
                value={description}
                onChange={setDescription}
              />
            )}

            {step === 3 && <LabelsStep value={labels} onChange={setLabels} />}

            {step === 4 &&
              (isLoadingPreview || !previewDraft ? (
                <p className="m-0 text-[12.5px] text-text-dim">Loading preview…</p>
              ) : (
                <PreviewConfirmStep
                  draft={previewDraft}
                  validation={validation}
                  isValidating={isValidating}
                  isCreating={isCreating}
                  createError={createError}
                  createdTool={createdTool}
                  onCreate={handleCreate}
                />
              ))}
          </div>

          {stepError ? (
            <p role="alert" className="m-0 text-[12.5px] text-status-error-label">
              {stepError}
            </p>
          ) : null}

          {createdTool ? (
            <div className="flex items-center justify-between border-t border-border-subtle pt-5">
              <button
                type="button"
                onClick={startAnother}
                className="rounded-md bg-text px-5 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90"
              >
                Add another tool
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between border-t border-border-subtle pt-5">
              <button
                type="button"
                onClick={goBack}
                disabled={step === 1 || isSavingStep}
                className="rounded-md border border-border bg-surface px-4 py-2 text-[13px] font-medium text-text-muted transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
              >
                Back
              </button>

              {step < TOTAL_STEPS ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!canContinue || isSavingStep}
                  className="rounded-md bg-text px-5 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSavingStep ? "Saving…" : "Continue"}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}