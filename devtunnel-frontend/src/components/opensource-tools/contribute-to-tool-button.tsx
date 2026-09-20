"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { SignInLink } from "@/components/auth/sign-in-link";
import { useAuth } from "@/lib/auth/use-auth";
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
   * The tool's repository URL, when it has one. Only used to soften the
   * error copy for a tool with nothing to contribute to on GitHub; the
   * Contribute page itself re-reads this from its own payload.
   */
  repositoryUrl: string | null;
}

/**
 * Tool Detail page's primary action, and the one accent-colored button on
 * the page.
 *
 * **Changed** alongside `ContributeButton` on the project page, and for
 * the same reason: registering interest and then leaving someone on the
 * page they were already reading wastes the moment they decided to help.
 * It now joins and navigates to `/opensource-tools/:slug/contribute`.
 *
 * It still promises less than the project button, and that difference now
 * lives on the destination page rather than in a one-line message here.
 * Joining a *project* unlocks that project's DevTunnel tasks; there are
 * no tasks on a tool (`devtunnel.tasks` hangs off a project, sql/017), so
 * the Contribute page's Tasks tab says exactly that and points at the
 * tool's own open issues instead of implying a DevTunnel backlog exists.
 *
 * An already-joined contributor skips the request and goes straight
 * through — there's nothing to re-join, and the label names what the
 * click does rather than describing a state.
 */
export function ContributeToToolButton({
  slug,
  initialIsContributing,
  repositoryUrl,
}: ContributeToToolButtonProps) {
  const router = useRouter();
  const [isContributing, setIsContributing] = useState(initialIsContributing);
  const [status, setStatus] = useState<"idle" | "loading" | "navigating" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const contributeHref = `/opensource-tools/${slug}/contribute`;

  const { user, status: authStatus } = useAuth();

  // A signed-out visitor can't join, but the contribution guide itself is
  // public — so keep both: a sign-in link for the join action, and the
  // plain link to read how to contribute first (rules 10 and 37).
  if (!user && authStatus === "unauthenticated") {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <SignInLink
          variant="primary"
          icon={<PlusIcon className="h-3.5 w-3.5 shrink-0" />}
        >
          Sign in to contribute
        </SignInLink>
        <a
          href={contributeHref}
          className="text-[12px] text-text-faint underline-offset-2 hover:text-accent hover:underline"
        >
          {repositoryUrl ? "See how to contribute first" : "See what this tool takes"}
        </a>
      </div>
    );
  }

  async function handleClick() {
    if (status === "loading" || status === "navigating") return;

    if (isContributing) {
      setStatus("navigating");
      router.push(contributeHref);
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    try {
      const result = await joinOpenSourceTool(slug);
      setIsContributing(result.contributing);
      setStatus("navigating");
      router.push(contributeHref);
    } catch (err) {
      setStatus("error");
      if (err instanceof OpenSourceToolsApiError && err.code === "onboarding_required") {
        setErrorMessage("Finish setting up your profile first, then come back to this tool.");
      } else {
        setErrorMessage("Couldn't register your interest right now. Try again in a moment.");
      }
    }
  }

  const isBusy = status === "loading" || status === "navigating";

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${
          isContributing
            ? "border border-border bg-surface-selected text-status-success-label disabled:opacity-60"
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
        {status === "loading"
          ? "Registering…"
          : status === "navigating"
            ? "Opening…"
            : isContributing
              ? "Continue contributing"
              : "Contribute to this tool"}
      </button>

      {status === "error" && errorMessage ? (
        <p className="m-0 text-[12px] text-status-error-label">{errorMessage}</p>
      ) : null}

      {!isContributing && status !== "loading" ? (
        <a
          href={contributeHref}
          className="text-[12px] text-text-faint underline-offset-2 hover:text-accent hover:underline"
        >
          {repositoryUrl ? "See how to contribute first" : "See what this tool takes"}
        </a>
      ) : null}
    </div>
  );
}
