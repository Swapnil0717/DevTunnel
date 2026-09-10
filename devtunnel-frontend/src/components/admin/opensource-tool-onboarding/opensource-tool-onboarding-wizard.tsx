"use client";

import { useState } from "react";
import { Logo } from "@/components/layout/logo";
import { StepIndicator } from "@/components/onboarding/step-indicator";
import { SectionMessage } from "@/components/home/section-message";
import {
  saveToolDescription,
  saveToolLabels,
  ToolOnboardingApiError,
} from "@/lib/admin/opensource-tool-onboarding/api";
import type {
  OnboardingToolDescription,
  OnboardingToolLabels,
  ToolOnboardingDraft,
} from "@/lib/admin/opensource-tool-onboarding/types";
import { ToolUrlStep } from "./steps/tool-url-step";
import { DescriptionStep } from "./steps/description-step";
import { LabelsStep } from "./steps/labels-step";

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
 * Built incrementally, one step at a time: Step 1 (Tool URL), Step 2
 * (Description) and Step 3 (Labels) are wired to real state and real API
 * calls so far. Step 4 renders an honest `SectionMessage` placeholder —
 * same "don't fake functionality that doesn't work yet" convention the
 * rest of the Admin Portal uses (Frontend_Development_Rules.txt rule
 * 26) — until it's built and swapped in.
 */
export function OpenSourceToolOnboardingWizard() {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ToolOnboardingDraft | null>(null);

  const [description, setDescription] = useState<OnboardingToolDescription>(DEFAULT_DESCRIPTION);
  const [labels, setLabels] = useState<OnboardingToolLabels>(DEFAULT_LABELS);
  const [isSavingStep, setIsSavingStep] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  function goBack() {
    setStepError(null);
    setStep((current) => Math.max(1, current - 1));
  }

  async function goNext() {
    setStepError(null);

    if (step === 2) {
      if (!draft) return;
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
      if (!draft) return;
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

            {step === 4 && (
              <div>
                <h1 className="m-0 mb-1 text-[16px] font-medium text-text">
                  Preview &amp; confirm
                </h1>
                <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
                  Review everything before adding this tool to the catalog.
                </p>
                <SectionMessage>This step isn&apos;t built yet — check back soon.</SectionMessage>
              </div>
            )}
          </div>

          {stepError ? (
            <p role="alert" className="m-0 text-[12.5px] text-status-error-label">
              {stepError}
            </p>
          ) : null}

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
        </div>
      </div>
    </main>
  );
}