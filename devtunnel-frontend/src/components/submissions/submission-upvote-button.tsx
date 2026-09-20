"use client";

import { useSubmissionUpvote } from "@/lib/submissions/use-submission-upvote";

/**
 * The upvote control on a submission's view page — a labelled button
 * with the count beside it, sized to sit among the page's other header
 * actions. The Community list card has its own compact stacked variant;
 * both drive `useSubmissionUpvote`, so a vote behaves identically in
 * either place.
 *
 * The state is a word ("Upvote" / "Upvoted") as well as a colour, and
 * `aria-pressed` carries it for screen readers (rule 43). A failed vote
 * reverts and says so in an `alert` rather than silently un-pressing.
 */
export function SubmissionUpvoteButton({
  slug,
  name,
  initialUpvoted,
  initialCount,
}: {
  slug: string;
  name: string;
  initialUpvoted: boolean;
  initialCount: number;
}) {
  const { upvoted, count, isSaving, error, toggle } = useSubmissionUpvote(
    slug,
    initialUpvoted,
    initialCount,
  );

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={isSaving}
        aria-pressed={upvoted}
        aria-label={upvoted ? `Remove your upvote from ${name}` : `Upvote ${name}`}
        className={`inline-flex shrink-0 items-center gap-2 rounded-[8px] border px-3.5 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          upvoted
            ? "border-accent/40 bg-surface-selected text-status-success-label"
            : "border-border bg-surface text-text hover:bg-surface-raised"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </svg>
        {upvoted ? "Upvoted" : "Upvote"}
        <span className="tabular-nums text-text-faint">{count.toLocaleString()}</span>
      </button>

      {error ? (
        <p role="alert" className="m-0 text-[11.5px] text-status-error-label">
          {error}
        </p>
      ) : null}
    </div>
  );
}
