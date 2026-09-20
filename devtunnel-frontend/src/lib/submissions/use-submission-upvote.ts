"use client";

import { useState } from "react";
import { SubmissionsApiError, setSubmissionUpvote } from "./client-api";

export interface SubmissionUpvoteState {
  upvoted: boolean;
  count: number;
  isSaving: boolean;
  /** A short, user-readable failure message, or `null`. */
  error: string | null;
  toggle: () => Promise<void>;
}

/**
 * One submission's upvote state and the write behind it — shared by the
 * Community list card and the view page, so the two can't drift on how a
 * vote behaves (rule 51).
 *
 * The button writes through to the API and takes the count the server
 * returns rather than trusting its own arithmetic, since that number is
 * what the Popular and Trending sorts order by — a card showing a count
 * one higher than the sort used would be quietly wrong (rule 38). It
 * updates optimistically and reverts on failure, so a slow network reads
 * as "nothing happened" rather than "it worked, then didn't".
 */
export function useSubmissionUpvote(
  slug: string,
  initialUpvoted: boolean,
  initialCount: number,
): SubmissionUpvoteState {
  const [upvoted, setUpvoted] = useState(initialUpvoted);
  const [count, setCount] = useState(initialCount);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (isSaving) return;

    const next = !upvoted;
    const previousCount = count;

    setIsSaving(true);
    setError(null);
    setUpvoted(next);
    setCount((current) => current + (next ? 1 : -1));

    try {
      const status = await setSubmissionUpvote(slug, next);
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

  return { upvoted, count, isSaving, error, toggle };
}
