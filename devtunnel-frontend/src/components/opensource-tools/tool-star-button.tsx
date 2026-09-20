"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { SignInLink } from "@/components/auth/sign-in-link";
import { GithubLoginButton } from "@/components/auth/github-login-button";
import { StarIcon } from "@/components/layout/nav-icons";
import { useAuth } from "@/lib/auth/use-auth";
import { formatCompactNumber } from "@/lib/github-projects/format-compact-number";
import {
  OpenSourceToolsApiError,
  starOpenSourceTool,
  unstarOpenSourceTool,
} from "@/lib/opensource-tools/client-api";

interface ToolStarButtonProps {
  slug: string;
  /** Initial values from the server-rendered `OpenSourceToolDetail` payload. */
  initialStarredByViewer: boolean;
  initialLocalStarCount: number;
}

/**
 * Tool Detail page's Star action.
 *
 * Same behavior and markup as `ProjectStarButton`
 * (`components/projects/project-star-button.tsx`) and the two GitHub-
 * catalog star buttons: optimistic toggle with rollback on failure, and
 * an inline "Reconnect GitHub" prompt for the `github_reauth_required`
 * case instead of a dead-end error. Only the endpoint and the re-auth
 * return path differ, which is the whole reason it's a separate
 * component rather than a shared one with three sets of props.
 *
 * The page only renders this when the tool actually has a GitHub
 * repository behind it — starring is a GitHub action, and there's
 * nothing to star on a tool whose source is a docs site.
 */
export function ToolStarButton({
  slug,
  initialStarredByViewer,
  initialLocalStarCount,
}: ToolStarButtonProps) {
  const [starred, setStarred] = useState(initialStarredByViewer);
  const [count, setCount] = useState(initialLocalStarCount);
  const [isBusy, setIsBusy] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { user, status: authStatus } = useAuth();

  // A signed-out visitor on a public page: starring is tied to a GitHub
  // account, so offer a real sign-in link instead of a button whose request
  // the backend would only reject. The count stays visible — it's public
  // information (Frontend_Development_Rules.txt rule 43).
  if (!user && authStatus === "unauthenticated") {
    return (
      <SignInLink icon={<StarIcon className="h-3.5 w-3.5 shrink-0" />}>
        Sign in to star
      {count > 0 ? (
        <span
          className="text-text-faint"
          aria-label={`${count.toLocaleString()} stars on DevTunnel`}
        >
          {formatCompactNumber(count)}
        </span>
      ) : null}
      </SignInLink>
    );
  }

  async function handleClick() {
    if (isBusy) return;

    const wasStarred = starred;
    const previousCount = count;

    setStarred(!wasStarred);
    setCount(wasStarred ? Math.max(0, previousCount - 1) : previousCount + 1);
    setIsBusy(true);
    setErrorMessage(null);
    setNeedsReauth(false);

    try {
      const status = wasStarred
        ? await unstarOpenSourceTool(slug)
        : await starOpenSourceTool(slug);
      setStarred(status.starredByViewer);
      setCount(status.localStarCount);
    } catch (err) {
      setStarred(wasStarred);
      setCount(previousCount);

      if (err instanceof OpenSourceToolsApiError && err.code === "github_reauth_required") {
        setNeedsReauth(true);
      } else {
        setErrorMessage(
          wasStarred
            ? "Couldn't unstar this tool right now."
            : "Couldn't star this tool right now.",
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
          <GithubLoginButton next={`/opensource-tools/${slug}`} />
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
          <StarIcon
            className={`h-3.5 w-3.5 shrink-0 ${starred ? "fill-current text-accent" : ""}`}
          />
        )}
        {starred ? "Starred" : "Star"}
        {count > 0 ? (
          <span
            className="text-text-faint"
            aria-label={`${count.toLocaleString()} stars on DevTunnel`}
          >
            {formatCompactNumber(count)}
          </span>
        ) : null}
      </button>

      {errorMessage ? (
        <p className="m-0 text-[12px] text-status-error-label">{errorMessage}</p>
      ) : null}
    </div>
  );
}
