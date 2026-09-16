"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { CheckCircleIcon, PlusIcon } from "@/components/layout/nav-icons";
import {
  OpenSourceToolsApiError,
  joinOpenSourceTool,
} from "@/lib/opensource-tools/client-api";

interface ContributeToToolButtonProps {
  slug: string;
  /** From the server-rendered payload — a returning contributor shouldn't be asked twice. */
  initialIsContributing: boolean;
  /**
   * The tool's repository URL, when it has one — the success message
   * points here, since the actual contributing happens in the tool's own
   * repository, not on DevTunnel.
   */
  repositoryUrl: string | null;
}

/**
 * Tool Detail page's primary action, and the one accent-colored button on
 * the page.
 *
 * Reads like `ContributeButton` on the project page and behaves like it —
 * idle → loading → joined, inline status underneath, no un-join — but it
 * promises less on purpose. Joining a *project* unlocks that project's
 * DevTunnel tasks; there are no tasks on a tool (`devtunnel.tasks` hangs
 * off a project, sql/017), so this registers interest and then hands the
 * contributor off to the tool's own repository, which is where the work
 * actually happens. Saying "you're in, now go pick a task" here would be
 * pointing at something that doesn't exist.
 *
 * For a tool with no repository behind it, the button still records
 * interest but the follow-up line drops the link rather than inventing a
 * destination.
 */
export function ContributeToToolButton({
  slug,
  initialIsContributing,
  repositoryUrl,
}: ContributeToToolButtonProps) {
  const [isContributing, setIsContributing] = useState(initialIsContributing);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [justJoined, setJustJoined] = useState(false);

  async function handleClick() {
    if (status === "loading" || isContributing) return;

    setStatus("loading");
    setErrorMessage(null);

    try {
      const result = await joinOpenSourceTool(slug);
      setIsContributing(result.contributing);
      setJustJoined(result.contributing);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      if (err instanceof OpenSourceToolsApiError && err.code === "onboarding_required") {
        setErrorMessage("Finish setting up your profile first, then come back to this tool.");
      } else {
        setErrorMessage("Couldn't register your interest right now. Try again in a moment.");
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
        {isContributing ? "Contributing" : isBusy ? "Registering…" : "Contribute to this tool"}
      </button>

      {justJoined ? (
        <p className="m-0 text-[12px] text-status-success-label">
          Noted.{" "}
          {repositoryUrl ? (
            <>
              Head to{" "}
              <a
                href={`${repositoryUrl}/issues`}
                target="_blank"
                rel="noreferrer noopener"
                className="underline hover:text-accent"
              >
                the tool&apos;s open issues
              </a>{" "}
              to find something to pick up.
            </>
          ) : (
            "Check the All Issues tab for something to pick up."
          )}
        </p>
      ) : null}

      {status === "error" && errorMessage ? (
        <p className="m-0 text-[12px] text-status-error-label">{errorMessage}</p>
      ) : null}
    </div>
  );
}
