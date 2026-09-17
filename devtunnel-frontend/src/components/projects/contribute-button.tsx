"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  /** How many DevTunnel tasks this project has, so the fallback copy can be honest about what's waiting. */
  taskCount: number;
}

/**
 * View Project page's primary action. This is the one button on the page
 * that carries the accent color — everything else (Star, View on GitHub)
 * is a secondary bordered button, so the page has a single obvious next
 * step rather than three equal-weight ones.
 *
 * **Changed:** this used to join the project and then leave the person
 * exactly where they were, with a one-line "you're in — pick something
 * from the Tasks tab" message underneath. That answered the most
 * motivated moment in the whole flow with a sentence pointing at a tab.
 * It now joins and then navigates to `/projects/:slug/contribute`, which
 * is the page that actually answers "so what do I do?" — this project's
 * tasks, the kinds of contribution it takes, and the fork-to-PR flow.
 *
 * Joining still records the contributor on this project and unlocks its
 * tasks; it never forks the repository or opens anything upstream on
 * their behalf (see `joinDevtunnelProject` in `lib/projects/client-api.ts`).
 * The Contribute page is where picking something is still their decision.
 *
 * A contributor who has already joined skips the request entirely and
 * goes straight to the Contribute page — there's nothing to re-join, and
 * a button that does nothing on click is worse than one that takes you
 * somewhere useful. That's also why the joined label reads "Continue
 * contributing" rather than a disabled "Contributing": it names what the
 * click does (rule: a CTA says what happens when it's used).
 *
 * Same idle → loading → error shape `RequestOnboardingButton` uses for a
 * fire-and-report action — disabled with a spinner while in flight, then
 * a one-line inline status message underneath, since this app has no
 * toast library. The button stays in its busy state through the
 * navigation rather than flicking back to idle for a frame.
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
  const router = useRouter();
  const [isContributing, setIsContributing] = useState(initialIsContributing);
  const [status, setStatus] = useState<"idle" | "loading" | "navigating" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const contributeHref = `/projects/${slug}/contribute`;

  async function handleClick() {
    if (status === "loading" || status === "navigating") return;

    // Already a contributor: nothing to join, so go straight there.
    if (isContributing) {
      setStatus("navigating");
      router.push(contributeHref);
      return;
    }

    setStatus("loading");
    setErrorMessage(null);

    try {
      const result = await joinDevtunnelProject(slug);
      setIsContributing(result.contributing);
      setStatus("navigating");
      router.push(contributeHref);
    } catch (err) {
      setStatus("error");
      if (err instanceof DevtunnelProjectsApiError && err.code === "onboarding_required") {
        setErrorMessage("Finish setting up your profile first, then join this project.");
      } else {
        setErrorMessage("Couldn't join this project right now. Try again in a moment.");
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
          ? "Joining project…"
          : status === "navigating"
            ? "Opening…"
            : isContributing
              ? "Continue contributing"
              : "Contribute to this project"}
      </button>

      {status === "error" && errorMessage ? (
        <p className="m-0 text-[12px] text-status-error-label">{errorMessage}</p>
      ) : null}

      {/*
        Plain link alongside the button so the Contribute page is reachable
        without joining, and reachable at all if the join request keeps
        failing. `taskCount` makes the label say what's actually there
        rather than a generic "learn more" (rule 38 — the count comes from
        the same payload the Tasks tab renders).
      */}
      {!isContributing && status !== "loading" ? (
        <a
          href={contributeHref}
          className="text-[12px] text-text-faint underline-offset-2 hover:text-accent hover:underline"
        >
          {taskCount > 0
            ? `See the ${taskCount.toLocaleString()} open tasks first`
            : "See how to contribute first"}
        </a>
      ) : null}
    </div>
  );
}
