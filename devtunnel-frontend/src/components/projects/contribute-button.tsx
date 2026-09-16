"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { CheckCircleIcon, PlusIcon } from "@/components/layout/nav-icons";
import {
  DevtunnelProjectsApiError,
  joinDevtunnelProject,
} from "@/lib/projects/client-api";

interface ContributeButtonProps {
  slug: string;
  /** From the server-rendered payload — a returning contributor shouldn't be asked to join twice. */
  initialIsContributing: boolean;
  /** How many DevTunnel tasks this project has, so the success line can point somewhere real. */
  taskCount: number;
}

/**
 * View Project page's primary action. This is the one button on the page
 * that carries the accent color — everything else (Star, View on GitHub)
 * is a secondary bordered button, so the page has a single obvious next
 * step rather than three equal-weight ones.
 *
 * Joining records the contributor on this project and unlocks its tasks;
 * it never forks the repository or opens anything upstream on their
 * behalf (see `joinDevtunnelProject` in `lib/projects/client-api.ts`).
 * That's why the success copy sends them to the Tasks tab instead of
 * claiming work has started: picking a task is still their decision.
 *
 * Same idle → loading → success/error shape `RequestOnboardingButton`
 * already uses for a fire-and-report action — a disabled, spinner-labeled
 * button while in flight, then a one-line inline status message
 * underneath (this app has no toast library, so inline is the existing
 * convention). Once joined, the button stays in its "Contributing" state:
 * nothing here un-joins a project, so a second click has nothing useful
 * to do.
 *
 * A contributor who hasn't finished onboarding gets told that
 * specifically (`onboarding_required`) rather than a generic failure —
 * otherwise the only fixable error on this button would read as a broken
 * page.
 */
export function ContributeButton({
  slug,
  initialIsContributing,
  taskCount,
}: ContributeButtonProps) {
  const [isContributing, setIsContributing] = useState(initialIsContributing);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Only show the "you're in" line after joining *here*, not on every revisit. */
  const [justJoined, setJustJoined] = useState(false);

  async function handleClick() {
    if (status === "loading" || isContributing) return;

    setStatus("loading");
    setErrorMessage(null);

    try {
      const result = await joinDevtunnelProject(slug);
      setIsContributing(result.contributing);
      setJustJoined(result.contributing);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      if (err instanceof DevtunnelProjectsApiError && err.code === "onboarding_required") {
        setErrorMessage("Finish setting up your profile first, then join this project.");
      } else {
        setErrorMessage("Couldn't join this project right now. Try again in a moment.");
      }
    }
  }

  const isBusy = status === "loading";

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy || isContributing}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${
          isContributing
            ? "border border-border bg-surface-selected text-status-success-label"
            : "bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-60"
        }`}
      >
        {isBusy ? (
          <Spinner size={13} />
        ) : isContributing ? (
          <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <PlusIcon className="h-3.5 w-3.5 shrink-0" />
        )}
        {isContributing
          ? "Contributing"
          : isBusy
            ? "Joining project…"
            : "Contribute to this project"}
      </button>

      {justJoined ? (
        <p className="m-0 text-[12px] text-status-success-label">
          {taskCount > 0
            ? "You're in — pick something from the Tasks tab to get started."
            : "You're in — this project has no open tasks yet, so check All Issues."}
        </p>
      ) : null}

      {status === "error" && errorMessage ? (
        <p className="m-0 text-[12px] text-status-error-label">{errorMessage}</p>
      ) : null}
    </div>
  );
}
