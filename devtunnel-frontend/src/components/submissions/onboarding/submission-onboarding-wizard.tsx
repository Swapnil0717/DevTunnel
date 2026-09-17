"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/layout/logo";
import { ChevronLeftIcon } from "@/components/layout/nav-icons";
import { StepIndicator } from "@/components/onboarding/step-indicator";
import { LoadingPanel, Spinner } from "@/components/ui/spinner";
import {
  SubmissionsApiError,
  completeSubmission,
  fetchSubmissionDraft,
  saveSubmissionDetails,
} from "@/lib/submissions/client-api";
import {
  EMPTY_SUBMISSION_DETAILS,
  type CreatedSubmission,
  type SubmissionDraft,
  type SubmissionDraftDetails,
  type SubmissionKind,
} from "@/lib/submissions/types";
import { SourceUrlStep } from "./steps/source-url-step";
import { DetailsStep } from "./steps/details-step";
import { PreviewConfirmStep } from "./steps/preview-confirm-step";

const TOTAL_STEPS = 3;
const STEP_LABELS = ["Repository URL", "Description & tech", "Preview & confirm"];
const STEP_DESCRIPTIONS = [
  "Fetch it from GitHub.",
  "How it appears on the list.",
  "Check it, then publish.",
];

/**
 * `/submissions/new` — the contributor-facing submit wizard.
 *
 * Same three-panel shell as the admin onboarding wizards (rail with step
 * indicator, body, footer with Back/Continue), because a contributor who
 * has been through contributor onboarding has already learned this
 * layout — but three steps rather than five, and nothing here is a
 * curation decision.
 *
 * Draft state lives on the server from step 1 onward
 * (`devtunnel.user_submission_drafts`, sql/028), exactly as it does for
 * admin onboarding: the wizard reads `steps` back from each response
 * rather than deciding for itself that a step is complete. That's also
 * what makes a mid-wizard refresh survivable — the draft id is the state.
 *
 * `canContinue` gates the button on the same rules the backend enforces
 * (a custom description needs text, tech stack needs at least one tag, a
 * paid-alternative claim needs a named product). The client check exists
 * to explain the rule in place rather than to enforce it — the route's
 * zod schema and `complete_user_submission` both re-check, so a client
 * that skips this can't publish an incomplete row.
 */
export function SubmissionOnboardingWizard() {
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<SubmissionKind>("PROJECT");
  const [draft, setDraft] = useState<SubmissionDraft | null>(null);
  const [details, setDetails] = useState<SubmissionDraftDetails>(EMPTY_SUBMISSION_DETAILS);

  const [previewDraft, setPreviewDraft] = useState<SubmissionDraft | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const [isSavingStep, setIsSavingStep] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);

  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [created, setCreated] = useState<CreatedSubmission | null>(null);

  // Step 3 re-reads the draft from the server so the preview shows what
  // was actually stored, not what this component happens to hold.
  useEffect(() => {
    if (step !== 3 || !draft || created) return;

    let cancelled = false;
    setIsLoadingPreview(true);
    setStepError(null);

    fetchSubmissionDraft(draft.id)
      .then((next) => {
        if (cancelled) return;
        setPreviewDraft(next);
        setDraft(next);
      })
      .catch(() => {
        if (!cancelled) {
          setStepError("Couldn't load the preview. Go back a step and continue again.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPreview(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run on step/draft id change
  }, [step, draft?.id, created]);

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
        setDraft(await saveSubmissionDetails(draft.id, details));
        setStep(3);
      } catch (err) {
        setStepError(
          err instanceof SubmissionsApiError
            ? err.message
            : "Something went wrong. Check your connection and try again.",
        );
      } finally {
        setIsSavingStep(false);
      }
      return;
    }

    setStep((current) => Math.min(TOTAL_STEPS, current + 1));
  }

  async function handlePublish() {
    if (!draft) return;
    setIsPublishing(true);
    setPublishError(null);
    setDuplicate(false);

    try {
      setCreated(await completeSubmission(draft.id));
    } catch (err) {
      if (err instanceof SubmissionsApiError && err.code === "already_submitted") {
        setDuplicate(true);
      } else if (err instanceof SubmissionsApiError && err.code === "draft_incomplete") {
        setPublishError("Something's missing on an earlier step. Go back and check.");
      } else {
        setPublishError("Couldn't publish it right now. Try again in a moment.");
      }
    } finally {
      setIsPublishing(false);
    }
  }

  const canContinue =
    step === 1
      ? Boolean(draft?.source)
      : step === 2
        ? (details.descriptionSource === "EXISTING" ||
            Boolean(details.customDescription?.trim())) &&
          details.techStack.length > 0 &&
          (!details.isPaidAlternative || details.alternativeTo.length > 0)
        : true;

  return (
    <main className="flex min-h-screen w-full flex-col bg-bg lg:flex-row">
      <aside className="flex flex-shrink-0 flex-col gap-6 border-b border-border-subtle px-4 py-5 sm:px-6 lg:w-[320px] lg:justify-between lg:gap-0 lg:border-b-0 lg:border-r lg:px-10 lg:py-12 xl:w-[380px]">
        <Link
          href="/submissions"
          className="inline-flex w-fit items-center gap-1 text-[12px] font-medium text-text-faint transition-colors hover:text-accent lg:mb-4"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back to Community
        </Link>

        <div className="flex items-center justify-between lg:block">
          <Logo asLink={false} />
          <div className="lg:hidden">
            <StepIndicator currentStep={step} totalSteps={TOTAL_STEPS} orientation="horizontal" />
          </div>
        </div>

        <div className="hidden lg:block">
          <h2 className="m-0 mb-1 text-[19px] font-medium text-text">Submit a project or tool</h2>
          <p className="m-0 mb-10 max-w-[260px] text-[13px] leading-[1.6] text-text-muted">
            Share something you use or built. It goes on the community
            list with your name on it — DevTunnel doesn&apos;t review it.
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
          Nothing is published until you confirm on the last step.
        </p>
      </aside>

      <div className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-10 lg:px-16 lg:py-14 xl:px-20">
        <div className="flex w-full max-w-[720px] flex-col gap-6 sm:gap-8">
          <div className="flex-1">
            {step === 1 && (
              <SourceUrlStep
                draft={draft}
                kind={kind}
                onKindChange={setKind}
                onImported={(next) => {
                  setDraft(next);
                  setKind(next.kind);
                  // The backend seeds the tech stack from what it
                  // detected, so step 2 opens on a real starting point.
                  setDetails(next.details);
                  setPreviewDraft(null);
                }}
              />
            )}

            {step === 2 && draft?.source && (
              <DetailsStep source={draft.source} value={details} onChange={setDetails} />
            )}

            {step === 3 &&
              (isLoadingPreview || !previewDraft ? (
                <LoadingPanel label="Loading preview…" />
              ) : (
                <PreviewConfirmStep
                  draft={previewDraft}
                  isPublishing={isPublishing}
                  publishError={publishError}
                  duplicate={duplicate}
                  created={created}
                  onPublish={handlePublish}
                />
              ))}
          </div>

          {stepError ? (
            <p role="alert" className="m-0 text-[12.5px] text-status-error-label">
              {stepError}
            </p>
          ) : null}

          {created ? null : (
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
                  className="flex items-center gap-2 rounded-md bg-text px-5 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSavingStep ? (
                    <>
                      <Spinner size={13} />
                      Saving…
                    </>
                  ) : (
                    "Continue"
                  )}
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
