"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/layout/logo";
import { StepIndicator } from "@/components/onboarding/step-indicator";
import {
  completeOnboarding,
  detectTechStack,
  fetchOnboardingPreview,
  ProjectOnboardingApiError,
  saveDescription,
  saveTechStack,
  validateOnboarding,
} from "@/lib/admin/project-onboarding/api";
import {
  EMPTY_TECH_STACK,
  type CreatedProject,
  type OnboardingDescription,
  type OnboardingTechStack,
  type ProjectOnboardingDraft,
  type ProjectOnboardingValidationResult,
} from "@/lib/admin/project-onboarding/types";
import { RepositoryStep } from "./steps/repository-step";
import { DescriptionStep } from "./steps/description-step";
import { TechStackStep } from "./steps/tech-stack-step";
import { PreviewStep } from "./steps/preview-step";
import { ValidationStep } from "./steps/validation-step";

const TOTAL_STEPS = 5;
const STEP_LABELS = ["Repository", "Description", "Tech stack", "Preview", "Validation"];
const STEP_DESCRIPTIONS = [
  "Import the GitHub repository.",
  "Choose the DevTunnel description.",
  "Review the detected tech stack.",
  "Preview the DevTunnel project.",
  "Confirm and create the project.",
];

const DEFAULT_DESCRIPTION: OnboardingDescription = {
  choice: "EXISTING",
  customDescription: null,
};

/**
 * `/admin/projects/new` — Project Onboarding wizard
 * (admin_workflow.txt, section 6 — "Project Onboarding", the workflow the
 * spec calls "the most important Admin workflow").
 *
 * Mirrors the shape of the contributor-side `OnboardingWizard`
 * (components/onboarding/onboarding-wizard.tsx) deliberately — same
 * sidebar + step-rail layout, same `StepIndicator`, same
 * Back/Continue footer — so an Admin who has already been through the
 * contributor onboarding flow recognizes the pattern immediately. The
 * content is entirely different: 5 mandatory steps (Repository →
 * Description → Tech Stack → Preview → Validation) instead of 4, and
 * every step here persists to a **backend onboarding draft** as it goes
 * (`admin_workflow.txt` section 24 — "Do not let the frontend determine
 * whether onboarding is complete. Backend should maintain the state.")
 * rather than only being submitted once at the very end.
 *
 * `draft.steps` (the backend's own completion flags) is what actually
 * gates whether "Create / Import Project" can be pressed on Step 5 — this
 * component's local `step` number only controls which step is currently
 * *visible*, never whether the project is allowed to be created.
 *
 * Nothing here assumes a project row exists until `completeOnboarding`
 * returns — per section 6, "The project does not exist as an active
 * DevTunnel project before this point."
 */
export function ProjectOnboardingWizard() {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<ProjectOnboardingDraft | null>(null);

  const [description, setDescription] = useState<OnboardingDescription>(DEFAULT_DESCRIPTION);
  const [techStack, setTechStack] = useState<OnboardingTechStack>(EMPTY_TECH_STACK);
  const [isDetectingTechStack, setIsDetectingTechStack] = useState(false);

  const [previewDraft, setPreviewDraft] = useState<ProjectOnboardingDraft | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [validation, setValidation] = useState<ProjectOnboardingValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const [isSavingStep, setIsSavingStep] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdProject, setCreatedProject] = useState<CreatedProject | null>(null);

  // Step 3 entry: auto-detect the tech stack from the repository the
  // instant the Admin arrives here, so the fields are pre-filled rather
  // than blank ("the default values must come from repository analysis").
  useEffect(() => {
    if (step !== 3 || !draft || draft.techStack) return;
    setIsDetectingTechStack(true);
    detectTechStack(draft.id)
      .then((next) => {
        setDraft(next);
        if (next.techStack) setTechStack(next.techStack);
      })
      .catch(() => {
        setStepError("Couldn't auto-detect the tech stack. You can still enter it manually.");
      })
      .finally(() => setIsDetectingTechStack(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on step/draft id change
  }, [step, draft?.id]);

  // Step 4 entry: always re-fetch the preview from the backend so it
  // reflects exactly what's stored, not accumulated local state.
  useEffect(() => {
    if (step !== 4 || !draft) return;
    setIsLoadingPreview(true);
    fetchOnboardingPreview(draft.id)
      .then(setPreviewDraft)
      .catch(() => setStepError("Couldn't load the preview. Try going back and forward again."))
      .finally(() => setIsLoadingPreview(false));
  }, [step, draft?.id]);

  // Step 5 entry: run final validation immediately so the checklist and
  // any blocking issues are visible before the Admin even reaches for the
  // Create button.
  useEffect(() => {
    if (step !== 5 || !draft) return;
    setIsValidating(true);
    validateOnboarding(draft.id)
      .then(setValidation)
      .catch(() => setStepError("Couldn't run final validation. Try again."))
      .finally(() => setIsValidating(false));
  }, [step, draft?.id]);

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
        const next = await saveDescription(draft.id, description);
        setDraft(next);
        setStep(3);
      } catch (error) {
        setStepError(
          error instanceof ProjectOnboardingApiError
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
        const next = await saveTechStack(draft.id, techStack);
        setDraft(next);
        setStep(4);
      } catch (error) {
        setStepError(
          error instanceof ProjectOnboardingApiError
            ? "We couldn't save the tech stack. Please try again."
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
      const project = await completeOnboarding(draft.id);
      setCreatedProject(project);
    } catch (error) {
      setCreateError(
        error instanceof ProjectOnboardingApiError
          ? "This draft isn't ready to be created yet. Check the steps above."
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
    setTechStack(EMPTY_TECH_STACK);
    setPreviewDraft(null);
    setValidation(null);
    setCreatedProject(null);
    setCreateError(null);
    setStepError(null);
  }

  const canContinue =
    step === 1
      ? Boolean(draft?.repository?.hasGithubAppAccess)
      : step === 2
        ? description.choice === "EXISTING" || Boolean(description.customDescription?.trim())
        : true;

  return (
    <main className="flex min-h-screen w-full flex-col bg-bg lg:flex-row">
      {/* Sidebar: logo + vertical step rail on laptop; collapses to a
          compact top strip with the horizontal step bar on mobile
          (Frontend_Development_Rules.txt rule 33 — mobile-first). */}
      <aside className="flex flex-shrink-0 flex-col gap-6 border-b border-border-subtle px-4 py-5 sm:px-6 lg:w-[320px] lg:justify-between lg:gap-0 lg:border-b-0 lg:border-r lg:px-10 lg:py-12 xl:w-[380px]">
        <div className="flex items-center justify-between lg:block">
          <Logo asLink={false} />
          <div className="lg:hidden">
            <StepIndicator currentStep={step} totalSteps={TOTAL_STEPS} orientation="horizontal" />
          </div>
        </div>

        <div className="hidden lg:block">
          <h2 className="m-0 mb-1 text-[19px] font-medium text-text">Project onboarding</h2>
          <p className="m-0 mb-10 max-w-[260px] text-[13px] leading-[1.6] text-text-muted">
            Import a GitHub repository and curate its DevTunnel
            representation. Nothing goes live until every step is
            validated.
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
          GitHub remains the source of truth — Admin curates the DevTunnel
          representation.
        </p>
      </aside>

      {/* Content column */}
      <div className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-10 lg:px-16 lg:py-14 xl:px-20">
        <div className="flex w-full max-w-[720px] flex-col gap-6 sm:gap-8">
          <div className="flex-1">
            {step === 1 && (
              <RepositoryStep
                draft={draft}
                onImported={(next) => {
                  setDraft(next);
                  setDescription(next.description ?? DEFAULT_DESCRIPTION);
                }}
              />
            )}
            {step === 2 && draft?.repository && (
              <DescriptionStep
                repository={draft.repository}
                value={description}
                onChange={setDescription}
              />
            )}
            {step === 3 && (
              <TechStackStep
                value={techStack}
                onChange={setTechStack}
                isDetecting={isDetectingTechStack}
              />
            )}
            {step === 4 &&
              (isLoadingPreview || !previewDraft ? (
                <p className="m-0 text-[12.5px] text-text-dim">Loading preview…</p>
              ) : (
                <PreviewStep draft={previewDraft} />
              ))}
            {step === 5 && draft && (
              <ValidationStep
                steps={draft.steps}
                validation={validation}
                isValidating={isValidating}
                isCreating={isCreating}
                createError={createError}
                createdProject={createdProject}
                onCreate={handleCreate}
              />
            )}
          </div>

          {stepError ? (
            <p role="alert" className="m-0 text-[12.5px] text-status-error-label">
              {stepError}
            </p>
          ) : null}

          {createdProject ? (
            <div className="flex items-center justify-between border-t border-border-subtle pt-5">
              <button
                type="button"
                onClick={startAnother}
                className="rounded-md bg-text px-5 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90"
              >
                Import another project
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