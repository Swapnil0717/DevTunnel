"use client";

import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { GithubLoginButton } from "@/components/auth/github-login-button";
import { StarIcon } from "@/components/layout/nav-icons";
import { formatCompactNumber } from "@/lib/github-projects/format-compact-number";
import {
  DevtunnelProjectsApiError,
  starDevtunnelProject,
  unstarDevtunnelProject,
} from "@/lib/projects/client-api";

interface ProjectStarButtonProps {
  slug: string;
  /** Initial values from the server-rendered `DevtunnelProjectDetail` payload. */
  initialStarredByViewer: boolean;
  initialLocalStarCount: number;
}

/**
 * View Project page's Star action, sitting next to "Contribute to this
 * project" and "View on GitHub".
 *
 * Same behavior as `StarButton`
 * (`components/github-projects/star-button.tsx`): starring here also
 * stars the repository on the contributor's real GitHub account, the
 * toggle is optimistic with rollback on failure (starring feels instant
 * on GitHub itself, so it should here too), and a contributor whose
 * GitHub connection has lapsed gets an inline "Reconnect GitHub" prompt
 * rather than a dead-end error — the same `github_reauth_required`
 * handling `ContributionCalendar` established.
 *
 * Kept as its own component rather than reusing the GitHub-catalog one
 * directly: that button is hard-wired to `lib/github-projects/client-api`
 * (`/github-projects/:slug/star`) and to a `/github-projects/:slug`
 * re-auth return path. This one hits the DevTunnel project's own route
 * and returns the contributor to this page after reconnecting. The
 * markup is deliberately identical so the two read as the same control
 * in both halves of the app.
 */
export function ProjectStarButton({
  slug,
  initialStarredByViewer,
  initialLocalStarCount,
}: ProjectStarButtonProps) {
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
      const status = wasStarred
        ? await unstarDevtunnelProject(slug)
        : await starDevtunnelProject(slug);
      setStarred(status.starredByViewer);
      setCount(status.localStarCount);
    } catch (err) {
      // Roll back the optimistic flip.
      setStarred(wasStarred);
      setCount(previousCount);

      if (err instanceof DevtunnelProjectsApiError && err.code === "github_reauth_required") {
        setNeedsReauth(true);
      } else {
        setErrorMessage(
          wasStarred
            ? "Couldn't unstar this project right now."
            : "Couldn't star this project right now.",
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
          <GithubLoginButton next={`/projects/${slug}`} />
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
          <span className="text-text-faint" aria-label={`${count.toLocaleString()} stars on DevTunnel`}>
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
