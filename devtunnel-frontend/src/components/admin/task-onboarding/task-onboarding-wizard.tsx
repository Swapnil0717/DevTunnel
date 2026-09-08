"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/layout/logo";
import { StepIndicator } from "@/components/onboarding/step-indicator";
import {
  attachTechStack,
  completeTaskOnboarding,
  fetchTaskOnboardingPreview,
  saveCuration,
  saveIssueInformation,
  TaskOnboardingApiError,
  validateTaskOnboarding,
} from "@/lib/admin/task-onboarding/api";
import {
  DEFAULT_ISSUE_INFORMATION,
  EMPTY_TASK_CURATION,
  type CreatedTask,
  type TaskCuration,
  type TaskIssueInformation,
  type TaskOnboardingDraft,
  type TaskOnboardingValidationResult,
} from "@/lib/admin/task-onboarding/types";
import type { OnboardingTechStack } from "@/lib/admin/project-onboarding/types";
import { ProjectSelectionStep } from "./steps/project-selection-step";
import { IssueSelectionStep } from "./steps/issue-selection-step";
import { TaskDetailsStep } from "./steps/task-details-step";
import { TaskPreviewStep } from "./steps/task-preview-step";
import { TaskValidationStep } from "./steps/task-validation-step";

const TOTAL_STEPS = 5;
const STEP_LABELS = ["Project", "Issue", "Task details", "Preview", "Validation"];
const STEP_DESCRIPTIONS = [
  "Choose the DevTunnel project.",
  "Pick an existing GitHub issue.",
  "Curate role, difficulty and description.",
  "Preview the DevTunnel task.",
  "Confirm and create the task.",
];

/**
 * `/admin/tasks/new` — Task Onboarding wizard (admin_workflow.txt,
 * section 10 — "Create Task — Task Onboarding", the mandatory flow the
 * "Create Task" button starts).
 *
 * Deliberately mirrors `ProjectOnboardingWizard`'s shape — same sidebar +
 * step-rail layout, same `StepIndicator`, same Back/Continue footer — so
 * an Admin who has already run Project Onboarding recognizes the pattern
 * immediately. The step *count* differs from the spec's literal 7-step
 * list (Project → Existing Issue → Issue Information → Tech Stack →
 * Difficulty → Preview → Validation): Issue Information, Tech Stack, and
 * Difficulty are one screen here (`TaskDetailsStep`) rather than three,
 * matching section 29's own "Important UI implementation detail" —
 * "onboarding steps do not necessarily need to be N separate URL pages…
 * A better implementation is a single wizard" — while every one of the
 * backend's individual persistence calls (`saveIssueInformation`,
 * `attachTechStack`, `saveCuration`) still fires exactly as the spec's
 * API map describes, so `draft.steps` still gates completion at the same
 * granularity section 25 defines.
 *
 * `draft.steps` — the backend's own completion flags — is what actually
 * gates whether "Create Task" can be pressed on the final step; this
 * component's local `step` number only controls which step is currently
 * *visible*. Nothing here assumes a task exists until `completeTaskOnboarding`
 * returns — per section 12, the task only "becomes available" once
 * validation and creation both succeed.
 */
export function TaskOnboardingWizard() {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<TaskOnboardingDraft | null>(null);

  const [issueInformation, setIssueInformation] = useState<TaskIssueInformation>(
    DEFAULT_ISSUE_INFORMATION,
  );
  const [curation, setCuration] = useState<TaskCuration>(EMPTY_TASK_CURATION);
  const [pendingTechStack, setPendingTechStack] = useState<OnboardingTechStack | null>(null);

  const [previewDraft, setPreviewDraft] = useState<TaskOnboardingDraft | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [validation, setValidation] = useState<TaskOnboardingValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const [isSavingStep, setIsSavingStep] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdTask, setCreatedTask] = useState<CreatedTask | null>(null);

  // Step 4 entry (Preview): always re-fetch from the backend so it
  // reflects exactly what's stored, not accumulated local state. Also
  // updates `draft` since this call is what marks `previewCompleted` true
  // server-side — the Validation step's checklist reads `draft.steps`, so
  // without this it would still show Preview as incomplete.
  useEffect(() => {
    if (step !== 4 || !draft) return;
    setIsLoadingPreview(true);
    fetchTaskOnboardingPreview(draft.id)
      .then((next) => {
        setPreviewDraft(next);
        setDraft(next);
      })
      .catch(() => setStepError("Couldn't load the preview. Try going back and forward again."))
      .finally(() => setIsLoadingPreview(false));
  }, [step, draft?.id]);

  // Step 5 entry (Validation): run final validation immediately so the
  // checklist and any blocking issues are visible before the Admin
  // reaches for the Create button.
  useEffect(() => {
    if (step !== 5 || !draft) return;
    setIsValidating(true);
    validateTaskOnboarding(draft.id)
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

    if (step === 3) {
      setIsSavingStep(true);
      try {
        let next = await saveIssueInformation(draft.id, issueInformation);
        if (pendingTechStack && !next.steps.techStackLoaded) {
          next = await attachTechStack(draft.id);
        }
        next = await saveCuration(next.id, curation);
        setDraft(next);
        setStep(4);
      } catch (error) {
        setStepError(
          error instanceof TaskOnboardingApiError
            ? "We couldn't save the task details. Please try again."
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
      const task = await completeTaskOnboarding(draft.id);
      setCreatedTask(task);
    } catch (error) {
      setCreateError(
        error instanceof TaskOnboardingApiError
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
    setIssueInformation(DEFAULT_ISSUE_INFORMATION);
    setCuration(EMPTY_TASK_CURATION);
    setPendingTechStack(null);
    setPreviewDraft(null);
    setValidation(null);
    setCreatedTask(null);
    setCreateError(null);
    setStepError(null);
  }

  const canContinue =
    step === 1
      ? Boolean(draft?.project)
      : step === 2
        ? Boolean(draft?.issue)
        : step === 3
          ? Boolean(curation.role) &&
            Boolean(curation.difficulty) &&
            (issueInformation.choice === "EXISTING" ||
              Boolean(issueInformation.customDescription?.trim()))
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
          <h2 className="m-0 mb-1 text-[19px] font-medium text-text">Task onboarding</h2>
          <p className="m-0 mb-10 max-w-[260px] text-[13px] leading-[1.6] text-text-muted">
            Turn a GitHub issue into a DevTunnel task. Nothing is
            available to contributors until every step is validated.
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
          GitHub issues aren&apos;t modified — Admin curates the DevTunnel
          representation of the issue.
        </p>
      </aside>

      {/* Content column */}
      <div className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-10 lg:px-16 lg:py-14 xl:px-20">
        <div className="flex w-full max-w-[720px] flex-col gap-6 sm:gap-8">
          <div className="flex-1">
            {step === 1 && (
              <ProjectSelectionStep
                draft={draft}
                onSelected={(next) => {
                  setDraft(next);
                  setIssueInformation(next.issueInformation ?? DEFAULT_ISSUE_INFORMATION);
                  setCuration(next.curation ?? EMPTY_TASK_CURATION);
                }}
              />
            )}
            {step === 2 && draft && (
              <IssueSelectionStep draft={draft} onSelected={setDraft} />
            )}
            {step === 3 && draft && (
              <TaskDetailsStep
                draft={draft}
                issueInformation={issueInformation}
                onIssueInformationChange={setIssueInformation}
                curation={curation}
                onCurationChange={setCuration}
                onTechStackLoaded={setPendingTechStack}
              />
            )}
            {step === 4 &&
              (isLoadingPreview || !previewDraft ? (
                <p className="m-0 text-[12.5px] text-text-dim">Loading preview…</p>
              ) : (
                <TaskPreviewStep draft={previewDraft} />
              ))}
            {step === 5 && draft && (
              <TaskValidationStep
                steps={draft.steps}
                validation={validation}
                isValidating={isValidating}
                isCreating={isCreating}
                createError={createError}
                createdTask={createdTask}
                onCreate={handleCreate}
              />
            )}
          </div>

          {stepError ? (
            <p role="alert" className="m-0 text-[12.5px] text-status-error-label">
              {stepError}
            </p>
          ) : null}

          {createdTask ? (
            <div className="flex items-center justify-between border-t border-border-subtle pt-5">
              <button
                type="button"
                onClick={startAnother}
                className="rounded-md bg-text px-5 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90"
              >
                Create another task
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