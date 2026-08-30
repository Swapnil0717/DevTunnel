"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import { StatusDot } from "@/components/ui/status-dot";

const DEFAULT_DESTINATION = "/dashboard";

/**
 * Handles the return leg of the GitHub OAuth flow (devtunnel_workflow.txt,
 * Module C1 — Authentication: "GitHub OAuth callback").
 *
 * Assumption (documented since the backend isn't part of this deliverable):
 * GitHub's OAuth callback URL is registered to the *backend's*
 * `GET /auth/callback`, because exchanging the authorization code for a
 * token requires the OAuth client secret, which must never live in
 * frontend code (rule 19). The backend performs that exchange, starts the
 * session, and redirects the browser here — to this frontend route — with
 * either:
 *   - `?status=success&next=/some/path`, or
 *   - `?status=error&reason=<human-readable-reason>`
 *
 * This page never sees, stores, or forwards the GitHub `code` itself.
 */
export function OAuthCallbackView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();

  const status = searchParams.get("status");
  const reason = searchParams.get("reason");
  const next = searchParams.get("next") || DEFAULT_DESTINATION;

  const [hasError] = useState(status === "error");

  useEffect(() => {
    if (status === "error") return;

    let isCancelled = false;

    async function completeSignIn() {
      await refreshUser();
      if (!isCancelled) {
        router.replace(next);
      }
    }

    void completeSignIn();

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (hasError) {
    return (
      <div
        role="alert"
        className="w-full max-w-[360px] rounded-[10px] border border-status-error-border bg-status-error-bg px-6 py-7 text-center"
      >
        <div className="mb-3 flex items-center justify-center gap-1.5">
          <StatusDot color="#E24B4A" />
          <span className="font-mono text-[11px] text-status-error-label">error</span>
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

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full max-w-[360px] rounded-[10px] border border-border bg-surface px-6 py-7 text-center"
    >
      <div className="mb-3 flex items-center justify-center gap-1.5">
        <StatusDot color="#378ADD" />
        <span className="font-mono text-[11px] text-text-muted">loading</span>
      </div>
      <h1 className="m-0 mb-2 text-[15px] font-medium text-text">Completing sign-in</h1>
      <p className="m-0 text-[13px] leading-[1.5] text-text-muted">
        Confirming your GitHub account. You&apos;ll be redirected in a moment.
      </p>
    </div>
  );
}
