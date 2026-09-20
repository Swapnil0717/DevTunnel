"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { SignInLink } from "@/components/auth/sign-in-link";
import { useAuth } from "@/lib/auth/use-auth";
import { requestGithubToolOnboarding } from "@/lib/github-open-source-tools/client-api";

/**
 * Tool Detail page's secondary action, next to "View on GitHub" — lets a
 * contributor flag a repository they think belongs on DevTunnel, as
 * either a DevTunnel Project or an Open Source Tool, without needing to
 * be an Admin themselves. Fires `requestGithubToolOnboarding`
 * (`lib/github-open-source-tools/client-api.ts`), which only ever queues
 * the repository as a candidate for an Admin to review — it never runs
 * the actual onboarding flow itself (see that file's doc comment for
 * why).
 *
 * Sibling of `RequestOnboardingButton`
 * (`components/github-projects/request-onboarding-button.tsx`): same
 * idle → loading → success/error shape, same inline-status-message
 * convention (this app has no toast/notification library). Wording
 * differs deliberately — a repository landing here (on the tools
 * catalog) may end up onboarded either as a DevTunnel Project or as an
 * Open Source Tool depending on what an Admin decides, so the label and
 * copy say "project or tool" rather than assuming one outcome. Once
 * requested for this session, the button stays disabled with the
 * confirmation message in place — nothing here un-nominates a
 * repository, so there's nothing a second click could usefully do.
 */
export function RequestToolOnboardingButton({ slug }: { slug: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const { user, status: authStatus } = useAuth();

  // Nominating a repository is an account action (the request lands in the
  // admins' queue under a real user), so a signed-out visitor gets a
  // sign-in link rather than a button the backend would reject.
  if (!user && authStatus === "unauthenticated") {
    return <SignInLink>Sign in to request this tool</SignInLink>;
  }

  async function handleClick() {
    setStatus("loading");
    try {
      await requestGithubToolOnboarding(slug);
      setStatus("success");
    } catch (err) {
      setStatus("error");
    }
  }

  const isBusy = status === "loading";
  const isDone = status === "success";

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy || isDone}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBusy ? <Spinner size={13} /> : null}
        {isDone
          ? "Requested — awaiting admin review"
          : isBusy
            ? "Sending to admins…"
            : "Request to add as DevTunnel project or tool"}
      </button>

      {status === "success" ? (
        <p className="m-0 text-[12px] text-status-success-label">
          Thanks — an admin will take a look at adding this repository to DevTunnel.
        </p>
      ) : null}

      {status === "error" ? (
        <p className="m-0 text-[12px] text-status-error-label">
          Couldn&apos;t reach admins right now. Try again in a moment.
        </p>
      ) : null}
    </div>
  );
}
