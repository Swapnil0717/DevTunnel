"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import { StatusDot } from "@/components/ui/status-dot";
import { needsOnboarding } from "@/lib/onboarding/needs-onboarding";

const DEFAULT_DESTINATION = "/home";

/** How long the "signed in" confirmation stays visible before redirecting. */
const SUCCESS_DISPLAY_MS = 700;

type CallbackPhase = "verifying" | "success" | "error";

/**
 * Handles the return leg of the GitHub OAuth flow.
 */
export function OAuthCallbackView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();

  const urlStatus = searchParams.get("status");
  const reason = searchParams.get("reason");
  const next = searchParams.get("next") || DEFAULT_DESTINATION;

  const [phase, setPhase] = useState<CallbackPhase>(
    urlStatus === "error" ? "error" : "verifying",
  );

  useEffect(() => {
    if (urlStatus === "error") return;

    let isCancelled = false;
    let redirectTimer: ReturnType<typeof setTimeout>;

    async function completeSignIn() {
      const freshUser = await refreshUser();

      if (isCancelled) return;

      const destination =
        freshUser && needsOnboarding(freshUser)
          ? "/onboarding"
          : next;

      setPhase("success");

      redirectTimer = setTimeout(() => {
        if (!isCancelled) {
          router.replace(destination);
        }
      }, SUCCESS_DISPLAY_MS);
    }

    void completeSignIn();

    return () => {
      isCancelled = true;
      clearTimeout(redirectTimer);
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatus]);

  if (phase === "error") {
    return (
      <div
        role="alert"
        className="w-full max-w-[360px] rounded-[10px] border border-status-error-border bg-status-error-bg px-6 py-7 text-center"
      >
        <div className="mb-3 flex items-center justify-center gap-1.5">
          <StatusDot color="#E24B4A" />

          <span className="font-mono text-[11px] text-status-error-label">
            error
          </span>
        </div>

        <h1 className="m-0 mb-2 text-[15px] font-medium text-text">
          We couldn&apos;t sign you in
        </h1>

        <p className="m-0 mb-5 text-[13px] leading-[1.5] text-status-error-text">
          {reason ?? "GitHub sign-in was cancelled or denied."}
        </p>

        <a
          href="/login"
          className="inline-block rounded-md bg-text px-4 py-2 text-[13px] font-medium text-bg transition-opacity hover:opacity-90"
        >
          Back to sign in
        </a>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-[360px] rounded-[10px] border border-status-success-border bg-status-success-bg px-6 py-7 text-center"
      >
        <div className="mb-3 flex items-center justify-center gap-1.5">
          <StatusDot color="#1D9E75" />

          <span className="font-mono text-[11px] text-status-success-label">
            signed in
          </span>
        </div>

        <h1 className="m-0 mb-2 text-[15px] font-medium text-text">
          You&apos;re signed in
        </h1>

        <p className="m-0 mb-4 text-[13px] leading-[1.5] text-status-success-text">
          Redirecting you now…
        </p>

        <div className="h-[2px] overflow-hidden rounded-full bg-status-success-border">
          <div className="h-full w-full bg-accent" />
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full max-w-[360px] rounded-[10px] border border-border bg-surface px-6 py-7 text-center"
    >
      <div className="mb-3 flex items-center justify-center gap-1.5">
        <StatusDot color="#378ADD" />

        <span className="font-mono text-[11px] text-text-muted">
          loading
        </span>
      </div>

      <h1 className="m-0 mb-2 text-[15px] font-medium text-text">
        Completing sign-in
      </h1>

      <p className="m-0 text-[13px] leading-[1.5] text-text-muted">
        Confirming your GitHub account. You&apos;ll be redirected in a moment.
      </p>
    </div>
  );
}