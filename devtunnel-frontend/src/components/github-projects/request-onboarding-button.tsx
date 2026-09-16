"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  GithubProjectsApiError,
  requestGithubProjectOnboarding,
} from "@/lib/github-projects/client-api";

/**
 * Project Detail page's secondary action, next to "View on GitHub" —
 * lets a contributor flag a repository they think belongs on DevTunnel,
 * without needing to be an Admin themselves. Fires
 * `requestGithubProjectOnboarding` (`lib/github-projects/client-api.ts`),
 * which only ever queues the repository as a candidate for an Admin to
 * review — it never runs the actual onboarding flow itself (see that
 * file's doc comment for why).
 *
 * Same idle → loading → success/error shape
 * `SyncAllProjectsGithubDataButton` already uses for a fire-and-report
 * action: a disabled, spinner-labeled button while the request is in
 * flight, then a one-line inline status message underneath (this app has
 * no toast/notification library, so an inline banner is the existing
 * convention rather than something new). Once nominated for this
 * session, the button stays disabled with the confirmation message in
 * place — nothing here un-nominates a repository, so there's nothing a
 * second click could usefully do.
 */
export function RequestOnboardingButton({ slug }: { slug: string }) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleClick() {
    setStatus("loading");
    try {
      await requestGithubProjectOnboarding(slug);
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
        {isDone ? "Nominated for DevTunnel" : isBusy ? "Sending to admins…" : "Nominate for DevTunnel"}
      </button>

      {status === "success" ? (
        <p className="m-0 text-[12px] text-status-success-label">
          Thanks — an admin will take a look at onboarding this repository.
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
