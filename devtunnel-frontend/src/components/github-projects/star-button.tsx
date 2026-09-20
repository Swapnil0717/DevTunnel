"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { GithubLoginButton } from "@/components/auth/github-login-button";
import { StarIcon } from "@/components/layout/nav-icons";
import { formatCompactNumber } from "@/lib/github-projects/format-compact-number";
import {
  GithubProjectsApiError,
  starGithubProject,
  unstarGithubProject,
} from "@/lib/github-projects/client-api";

interface StarButtonProps {
  slug: string;
  /** Initial values from the server-rendered `GithubProjectDetail` payload (`GET /github-projects/:slug`). */
  initialStarredByViewer: boolean;
  initialLocalStarCount: number;
}

/**
 * Project Detail page's "Star" action, next to "View on GitHub" and
 * "Nominate for DevTunnel" — starring here also stars the repository on
 * the contributor's own real GitHub account
 * (`lib/github-projects/client-api.ts` `starGithubProject`, backed by
 * `PUT /github-projects/:slug/star`, src/routes/githubProjects.ts),
 * not just a DevTunnel-local preference.
 *
 * Optimistic toggle with rollback on failure: the button and count flip
 * immediately on click (starring feels instant on real GitHub too), and
 * revert if the request fails — same "assume success, correct if wrong"
 * posture as everywhere else in this app that manages its own local
 * state around a mutation, rather than blocking the whole button behind
 * a loading spinner the way `RequestOnboardingButton`'s one-shot,
 * un-reversible nomination action does.
 *
 * A contributor with no live GitHub connection gets a "Reconnect
 * GitHub" prompt inline (`GithubLoginButton`) instead of a generic error
 * — same `github_reauth_required` handling
 * `ContributionCalendar` (`components/profile/contribution-calendar.tsx`)
 * already establishes for this exact backend error code — since a plain
 * "something went wrong" message would leave the contributor with no
 * way to actually fix it.
 */
export function StarButton({
  slug,
  initialStarredByViewer,
  initialLocalStarCount,
}: StarButtonProps) {
  const [starred, setStarred] = useState(initialStarredByViewer);
  const [count, setCount] = useState(initialLocalStarCount);
  const [isBusy, setIsBusy] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    if (isBusy) return;

    const wasStarred = starred;
    const previousCount = count;

    // Optimistic flip first — see doc comment above.
    setStarred(!wasStarred);
    setCount(wasStarred ? Math.max(0, previousCount - 1) : previousCount + 1);
    setIsBusy(true);
    setErrorMessage(null);
    setNeedsReauth(false);

    try {
      const status = wasStarred ? await unstarGithubProject(slug) : await starGithubProject(slug);
      setStarred(status.starredByViewer);
      setCount(status.localStarCount);
    } catch (err) {
      // Roll back the optimistic flip.
      setStarred(wasStarred);
      setCount(previousCount);

      if (err instanceof GithubProjectsApiError && err.code === "github_reauth_required") {
        setNeedsReauth(true);
      } else {
        setErrorMessage(
          wasStarred ? "Couldn't unstar this project right now." : "Couldn't star this project right now.",
        );
      }
    } finally {
      setIsBusy(false);
    }
  }

  if (needsReauth) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <p className="m-0 text-[12px] text-text-muted">
          Reconnect your GitHub account to star this project.
        </p>
        <div className="max-w-[220px]">
          <GithubLoginButton next={`/github-projects/${slug}`} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={isBusy}
        aria-pressed={starred}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBusy ? (
          <Spinner size={13} />
        ) : (
          <StarIcon className={`h-3.5 w-3.5 shrink-0 ${starred ? "fill-current text-accent" : ""}`} />
        )}
        {starred ? "Starred" : "Star"}
        {count > 0 ? (
          <span className="text-text-faint" aria-label={`${count.toLocaleString()} local stars`}>
            {formatCompactNumber(count)}
          </span>
        ) : null}
      </button>

      {errorMessage ? <p className="m-0 text-[12px] text-status-error-label">{errorMessage}</p> : null}
    </div>
  );
}
