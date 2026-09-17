"use client";

import { useState } from "react";
import { GitBranchIcon, ToolIcon, FolderIcon } from "@/components/layout/nav-icons";
import { getTechTagClasses } from "@/lib/home/tag-style";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { SubmissionsApiError, setSubmissionUpvote } from "@/lib/submissions/client-api";
import type { Submission } from "@/lib/submissions/types";

/**
 * One row of the Community list.
 *
 * Three things every card states plainly, because this list isn't
 * curated and shouldn't read as if it were:
 *  - who submitted it, with a link to their GitHub profile;
 *  - that the description is the submitter's or GitHub's, never
 *    DevTunnel's;
 *  - what it replaces, when it's a paid alternative — the claim is
 *    always attached to a named product, never a bare badge.
 *
 * Kind is a word next to its icon, not the icon alone (rule 43).
 *
 * The upvote button writes through to the API and renders the count the
 * server returns rather than incrementing locally, since that number is
 * what the Popular and Trending sorts order by — a card showing a count
 * one higher than the sort used would be quietly wrong (rule 38). It
 * updates optimistically and reverts on failure, so a slow network reads
 * as "nothing happened" rather than "it worked, then didn't".
 */
export function SubmissionCard({ submission }: { submission: Submission }) {
  const [upvoted, setUpvoted] = useState(submission.upvotedByViewer);
  const [count, setCount] = useState(submission.upvoteCount);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const KindIcon = submission.kind === "TOOL" ? ToolIcon : FolderIcon;

  async function toggleUpvote() {
    if (isSaving) return;

    const next = !upvoted;
    const previousCount = count;

    setIsSaving(true);
    setError(null);
    setUpvoted(next);
    setCount((current) => current + (next ? 1 : -1));

    try {
      const status = await setSubmissionUpvote(submission.slug, next);
      setUpvoted(status.upvotedByViewer);
      setCount(status.upvoteCount);
    } catch (err) {
      setUpvoted(!next);
      setCount(previousCount);
      setError(
        err instanceof SubmissionsApiError && err.status === 429
          ? "Slow down a moment, then try again."
          : "Couldn't record your vote.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <li className="flex gap-3 rounded-[10px] border border-border-subtle bg-surface-raised p-4 transition-colors hover:border-border">
      <div className="flex shrink-0 flex-col items-center gap-1">
        <button
          type="button"
          onClick={toggleUpvote}
          disabled={isSaving}
          aria-pressed={upvoted}
          aria-label={upvoted ? `Remove your upvote from ${submission.name}` : `Upvote ${submission.name}`}
          className={`flex h-8 w-9 items-center justify-center rounded-[7px] border text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            upvoted
              ? "border-accent/40 bg-surface-selected text-status-success-label"
              : "border-border-subtle bg-surface text-text-dim hover:text-text"
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5" />
            <path d="m5 12 7-7 7 7" />
          </svg>
        </button>
        <span className="text-[11px] tabular-nums text-text-faint">
          {count.toLocaleString()}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <a
            href={submission.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[13.5px] font-medium text-text hover:text-accent"
          >
            {submission.name}
          </a>
          <span className="inline-flex items-center gap-1 text-[11px] text-text-faint">
            <KindIcon className="h-3 w-3 shrink-0" />
            {submission.kind === "TOOL" ? "Tool" : "Project"}
          </span>
          {submission.isPaidAlternative ? (
            <span className="rounded-[5px] border border-tag-interest-border bg-tag-interest-bg px-[7px] py-[2px] text-[10.5px] text-tag-interest-text">
              Alternative to {submission.alternativeTo.join(", ")}
            </span>
          ) : null}
        </div>

        {submission.description ? (
          <p className="m-0 mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-text-secondary">
            {submission.description}
          </p>
        ) : (
          <p className="m-0 mt-1.5 text-[12.5px] text-text-faint">
            No description on the repository.
          </p>
        )}

        {submission.techStack.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {submission.techStack.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10.5px] ${getTechTagClasses(tag)}`}
              >
                {tag}
              </span>
            ))}
            {submission.techStack.length > 5 ? (
              <span className="text-[10.5px] text-text-faint">
                +{submission.techStack.length - 5}
              </span>
            ) : null}
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-text-faint">
          <span>
            Submitted by{" "}
            {submission.submittedBy.profileUrl ? (
              <a
                href={submission.submittedBy.profileUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-accent"
              >
                @{submission.submittedBy.username}
              </a>
            ) : (
              `@${submission.submittedBy.username}`
            )}
          </span>
          <span aria-hidden="true">·</span>
          <time dateTime={submission.createdAt}>
            {formatRelativeTime(submission.createdAt)}
          </time>

          {submission.repositoryFullName ? (
            <>
              <span aria-hidden="true">·</span>
              <a
                href={submission.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 font-mono hover:text-accent"
              >
                <GitBranchIcon className="h-3 w-3 shrink-0" />
                {submission.repositoryFullName}
              </a>
            </>
          ) : null}
        </div>

        {error ? (
          <p className="m-0 mt-2 text-[11.5px] text-status-error-label">{error}</p>
        ) : null}
      </div>
    </li>
  );
}
