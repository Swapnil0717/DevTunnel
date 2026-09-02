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
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Logo />
        <StepIndicator currentStep={step} totalSteps={TOTAL_STEPS} />
      </div>

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
    </main>
  );
}