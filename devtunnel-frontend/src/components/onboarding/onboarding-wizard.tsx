"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/layout/logo";
import { useAuth } from "@/lib/auth/use-auth";
import type { AuthUser } from "@/lib/auth/types";
import { OnboardingApiError, submitOnboarding } from "@/lib/onboarding/api";
import { EMPTY_ONBOARDING_DATA, type OnboardingData } from "@/lib/onboarding/types";
import { StepIndicator } from "./step-indicator";
import { WelcomeStep } from "./steps/welcome-step";
import { ProfileStep } from "./steps/profile-step";
import { IntentStep } from "./steps/intent-step";
import { ReviewStep } from "./steps/review-step";

const TOTAL_STEPS = 4;
const DEFAULT_DESTINATION = "/home";

const STEP_LABELS = ["Welcome", "Your profile", "Get started", "Review"];
const STEP_DESCRIPTIONS = [
  "Confirm what we imported from GitHub.",
  "Tell us about your skills and interests.",
  "Choose how you'd like to start.",
  "Double-check everything before you finish.",
];

interface OnboardingWizardProps {
  user: AuthUser;
}

/**
 * User onboarding flow (devtunnel_workflow.txt, Module C1 — Authentication:
 * "User onboarding" screen).
 *
 * Reached either because the backend's OAuth callback redirect included
 * `next=/onboarding`, or because OAuthCallbackView / (protected)/home's
 * own first-sign-in check (lib/onboarding/needs-onboarding.ts) sent the
 * person here — see those files for how "is this a new user?" is
 * determined on the frontend without any new backend work. Finishing here
 * always continues on to /home, same as anyone who never needed
 * onboarding in the first place.
 *
 * Layout: a two-column split on laptop/desktop — a fixed sidebar (logo +
 * vertical step rail with labels) on the left, the active step's content
 * in a constrained-width column on the right — collapsing to a single
 * stacked column with a compact horizontal step bar on mobile
 * (Frontend_Development_Rules.txt rule 33: mobile-first responsive
 * design; this is the "mobile-first" base, widened via `lg:` rather than
 * the other way around).
 *
 * The content column is vertically centered (`items-center`) so short
 * steps (Welcome) don't sit stranded near the top with a wall of empty
 * space above the Back/Continue footer. This is safe for the longer
 * steps too — once a step's content is taller than the available
 * height, flexbox has nothing left to center into, so it just renders
 * from the top like normal.
 */
export function OnboardingWizard({ user }: OnboardingWizardProps) {
  const router = useRouter();
  const { refreshUser } = useAuth();

  const [step, setStep] = useState(1);
  const [data, setData] = useState<OnboardingData>(EMPTY_ONBOARDING_DATA);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function patch(next: Partial<OnboardingData>) {
    setData((current) => ({ ...current, ...next }));
  }

  function goBack() {
    setSubmitError(null);
    setStep((current) => Math.max(1, current - 1));
  }

  function goNext() {
    setStep((current) => Math.min(TOTAL_STEPS, current + 1));
  }

  async function handleFinish() {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await submitOnboarding(data);
      // Backend sets `onboarding_completed = true` as part of this same
      // request (devtunnel-backend/src/db/users.ts, completeOnboarding),
      // so refreshing here is enough for needsOnboarding(user) to read
      // `false` from here on — no client-side flag needed.
      await refreshUser();
      router.push(DEFAULT_DESTINATION);
    } catch (error) {
      setIsSubmitting(false);
      setSubmitError(
        error instanceof OnboardingApiError
          ? "We couldn't save your profile. Please try again."
          : "Something went wrong. Check your connection and try again.",
      );
    }
  }

  // Both option groups on the profile step default to nothing selected, so
  // require a real choice before moving on; same for the intent step.
  const canContinue =
    !(step === 2 && (!data.developerRole || !data.experienceLevel)) &&
    !(step === 3 && !data.intent);

  return (
    <main className="flex min-h-screen w-full flex-col bg-bg lg:flex-row">
      {/* Sidebar: logo + vertical step rail on laptop; collapses to a
          compact top strip with the horizontal step bar on mobile. */}
      <aside className="flex flex-shrink-0 flex-col gap-6 border-b border-border-subtle px-4 py-5 sm:px-6 lg:w-[320px] lg:justify-between lg:gap-0 lg:border-b-0 lg:border-r lg:px-10 lg:py-12 xl:w-[380px]">
        <div className="flex items-center justify-between lg:block">
          <Logo />
          <div className="lg:hidden">
            <StepIndicator currentStep={step} totalSteps={TOTAL_STEPS} orientation="horizontal" />
          </div>
        </div>

        <div className="hidden lg:block">
          <h2 className="m-0 mb-1 text-[19px] font-medium text-text">Set up your profile</h2>
          <p className="m-0 mb-10 max-w-[260px] text-[13px] leading-[1.6] text-text-muted">
            A few quick steps so we can match you with the right open source
            projects.
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
          Signed in as @{user.username}
        </p>
      </aside>

      {/* Content column — vertically centered so short steps don't sit
          stranded near the top of a tall column. */}
      <div className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-10 lg:px-16 lg:py-14 xl:px-20">
        <div className="flex w-full max-w-[720px] flex-col gap-6 sm:gap-8">
          <div className="flex-1">
            {step === 1 && <WelcomeStep user={user} />}
            {step === 2 && <ProfileStep user={user} data={data} onChange={patch} />}
            {step === 3 && <IntentStep data={data} onChange={patch} />}
            {step === 4 && <ReviewStep data={data} />}
          </div>

          {submitError ? (
            <p role="alert" className="m-0 text-[12.5px] text-status-error-label">
              {submitError}
            </p>
          ) : null}

          <div className="flex items-center justify-between border-t border-border-subtle pt-5">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 1 || isSubmitting}
              className="rounded-md border border-border bg-surface px-4 py-2 text-[13px] font-medium text-text-muted transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canContinue}
                className="rounded-md bg-text px-5 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinish}
                disabled={isSubmitting}
                className="rounded-md bg-text px-5 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? "Saving…" : "Finish setup"}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}