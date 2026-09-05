"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import { StatusDot } from "@/components/ui/status-dot";
import { needsOnboarding } from "@/lib/onboarding/needs-onboarding";
import { isAdmin } from "@/lib/auth/is-admin";

const DEFAULT_DESTINATION = "/home";

/** How long the "signed in" confirmation stays visible before redirecting.
 * Long enough to read, short enough not to feel like a stall. */
const SUCCESS_DISPLAY_MS = 700;

type CallbackPhase = "verifying" | "success" | "error";

/**
 * Handles the return leg of the GitHub OAuth flow (devtunnel_workflow.txt,
 * Module C1 - Authentication: "GitHub OAuth callback").
 *
 * Assumption (documented since the backend isn't part of this deliverable):
 * GitHub's OAuth callback URL is registered to the backend's
 * GET /auth/callback, because exchanging the authorization code for a
 * token requires the OAuth client secret, which must never live in
 * frontend code (rule 19). The backend performs that exchange, starts the
 * session, and redirects the browser here - to this frontend route - with
 * either:
 *   - ?status=success&next=/some/path, or
 *   - ?status=error&reason=<human-readable-reason>
 *
 * This page never sees, stores, or forwards the GitHub code itself.
 *
 * Sign-in -> onboarding -> home routing (devtunnel_workflow.txt, Module C1):
 * once the session is confirmed via refreshUser(), a first-time sign-in
 * (needsOnboarding(freshUser)) always goes to /onboarding regardless of
 * next - next only matters for someone who's already onboarded (e.g. a
 * deep link that bounced them to /login first). Everyone else lands on
 * /home, never /dashboard (dashboard has no real content yet - it's
 * kept only as a redirect shim for old bookmarked links).
 *
 * Renders one of three real, mutually exclusive states - never a static
 * showcase of all of them at once (rule 23): verifying while GET /auth/me
 * confirms the new session, success briefly once it's confirmed, and
 * error when the backend reports the sign-in failed.
 *
 * Admin RBAC gate (devtunnel_workflow.txt, Module A1 - Admin
 * Authentication): this same callback also lands admin-portal sign-ins,
 * since /admin/login's GithubLoginButton posts next=/admin... through
 * the identical /auth/github -> /auth/callback flow - there is no
 * separate admin OAuth route. When next targets /admin, a confirmed
 * session that isn't role "ADMIN" must never be allowed through: rather
 * than routing it to /onboarding or /home like a contributor sign-in,
 * it's logged out again immediately (the GitHub identity is valid, it's
 * just not an authorized admin) and bounced back to
 * /admin/login?error=not_authorized, which explains why instead of
 * silently dropping the person into a portal they don't have access to.
 */
export function OAuthCallbackView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser, logout } = useAuth();

  const urlStatus = searchParams.get("status");
  const reason = searchParams.get("reason");
  const next = searchParams.get("next") || DEFAULT_DESTINATION;
  const isAdminNext = next === "/admin" || next.startsWith("/admin/");

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

      if (isAdminNext) {
        if (!freshUser || !isAdmin(freshUser)) {
          await logout();
          if (!isCancelled) router.replace("/admin/login?error=not_authorized");
          return;
        }

        setPhase("success");
        redirectTimer = setTimeout(() => {
          if (!isCancelled) router.replace(next);
        }, SUCCESS_DISPLAY_MS);
        return;
      }

      const destination =
        freshUser && needsOnboarding(freshUser) ? "/onboarding" : next;

      setPhase("success");
      redirectTimer = setTimeout(() => {
        if (!isCancelled) router.replace(destination);
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
          <span className="font-mono text-[11px] text-status-error-label">error</span>
        </div>
        <h1 className="m-0 mb-2 text-[15px] font-medium text-text">
          We couldn&apos;t sign you in
        </h1>
        <p className="m-0 mb-5 text-[13px] leading-[1.5] text-status-error-text">
          {reason ?? "GitHub sign-in was cancelled or denied."}
        </p>
        <a
          href={isAdminNext ? "/admin/login" : "/login"}
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
          <span className="font-mono text-[11px] text-status-success-label">signed in</span>
        </div>
        <h1 className="m-0 mb-2 text-[15px] font-medium text-text">You&apos;re signed in</h1>
        <p className="m-0 mb-4 text-[13px] leading-[1.5] text-status-success-text">
          Redirecting you now...
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
        <span className="font-mono text-[11px] text-text-muted">loading</span>
      </div>
      <h1 className="m-0 mb-2 text-[15px] font-medium text-text">Completing sign-in</h1>
      <p className="m-0 text-[13px] leading-[1.5] text-text-muted">
        Confirming your GitHub account. You&apos;ll be redirected in a moment.
      </p>
    </div>
  );
}
