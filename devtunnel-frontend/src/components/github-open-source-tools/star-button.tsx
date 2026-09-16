"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { GithubLoginButton } from "@/components/auth/github-login-button";
import { StarIcon } from "@/components/layout/nav-icons";
import { formatCompactNumber } from "@/lib/github-projects/format-compact-number";
import {
  GithubOpenSourceToolsApiError,
  starGithubTool,
  unstarGithubTool,
} from "@/lib/github-open-source-tools/client-api";

interface StarButtonProps {
  slug: string;
  /** Initial values from the server-rendered `GithubProjectDetail` payload (`GET /github-open-source-tools/:slug`). */
  initialStarredByViewer: boolean;
  initialLocalStarCount: number;
}

/**
 * Tool Detail page's "Star" action, next to "View on GitHub" and
 * "Request to add as DevTunnel project or tool" — sibling of
 * `StarButton` (`components/github-projects/star-button.tsx`), same
 * optimistic-toggle-with-rollback behavior and same
 * `github_reauth_required` → "Reconnect GitHub" handling, pointed at
 * this catalog's own `starGithubTool`/`unstarGithubTool`
 * (`lib/github-open-source-tools/client-api.ts`, backed by
 * `PUT`/`DELETE /github-open-source-tools/:slug/star`,
 * src/routes/githubOpenSourceTools.ts) instead. See that component's
 * doc comment for the full reasoning — kept as its own file rather than
 * shared since every other Detail-page action in this catalog
 * (`RequestToolOnboardingButton` vs. `RequestOnboardingButton`) already
 * follows the same one-file-per-catalog convention.
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

    // Optimistic flip first — see `StarButton`'s
    // (`components/github-projects/star-button.tsx`) doc comment.
    setStarred(!wasStarred);
    setCount(wasStarred ? Math.max(0, previousCount - 1) : previousCount + 1);
    setIsBusy(true);
    setErrorMessage(null);
    setNeedsReauth(false);

    try {
      const status = wasStarred ? await unstarGithubTool(slug) : await starGithubTool(slug);
      setStarred(status.starredByViewer);
      setCount(status.localStarCount);
    } catch (err) {
      // Roll back the optimistic flip.
      setStarred(wasStarred);
      setCount(previousCount);

      if (err instanceof GithubOpenSourceToolsApiError && err.code === "github_reauth_required") {
        setNeedsReauth(true);
      } else {
        setErrorMessage(
          wasStarred ? "Couldn't unstar this tool right now." : "Couldn't star this tool right now.",
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
          Reconnect your GitHub account to star this tool.
        </p>
        <div className="max-w-[220px]">
          <GithubLoginButton next={`/github-open-source-tools/${slug}`} />
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
