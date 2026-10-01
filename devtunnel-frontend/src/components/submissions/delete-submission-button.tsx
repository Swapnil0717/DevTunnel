"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@/components/layout/nav-icons";
import { Spinner } from "@/components/ui/spinner";
import { deleteSubmission, SubmissionsApiError } from "@/lib/submissions/client-api";

interface DeleteSubmissionButtonProps {
  slug: string;
  name: string;
  /**
   * `"card"` is the small control on a Community list row; `"button"` is the
   * full-size one on the view page.
   */
  variant?: "card" | "button";
  /** Where to go after deleting (the view page sends people back to the list). */
  redirectTo?: string;
  /** Called once the submission is gone, so a list can drop the row without a reload. */
  onDeleted?: (slug: string) => void;
}

/**
 * Lets the person who submitted a project or tool remove it from Community.
 *
 * Only rendered when `ownedByViewer` is true, but that is a display hint: the
 * backend re-checks ownership on `DELETE /submissions/:slug` and answers 403
 * to anyone else. Deleting only removes the DevTunnel listing — the GitHub
 * repository is never touched — and the repository can be submitted again
 * later, which the confirmation says so people aren't afraid to press it.
 *
 * The error text is the server's own message for the cases that have a real
 * explanation (403, 429), and one honest fallback otherwise. A `404` is
 * treated as success: it means the submission is already gone, which is the
 * state the person asked for.
 */
export function DeleteSubmissionButton({
  slug,
  name,
  variant = "button",
  redirectTo,
  onDeleted,
}: DeleteSubmissionButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${name}" from Community? It will be removed from the list along with its upvotes. The GitHub repository itself is not affected, and you can submit it again later.`,
    );
    if (!confirmed) return;

    setError(null);
    setIsDeleting(true);

    try {
      try {
        await deleteSubmission(slug);
      } catch (err) {
        if (!(err instanceof SubmissionsApiError && err.status === 404)) throw err;
      }

      onDeleted?.(slug);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof SubmissionsApiError && (err.status === 403 || err.status === 429)
          ? err.message
          : "Couldn't delete this submission. Try again.",
      );
      setIsDeleting(false);
    }
  }

  const label = isDeleting ? "Deleting…" : "Delete";

  if (variant === "card") {
    return (
      <span className="relative z-10 inline-flex flex-col items-end gap-0.5">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          aria-label={`Delete ${name}`}
          className="inline-flex items-center gap-1 rounded-[6px] border border-border-subtle px-2 py-1 text-[11.5px] text-status-error-label transition-colors hover:border-status-error-border hover:bg-status-error-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-error disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isDeleting ? <Spinner size={11} /> : <TrashIcon className="h-3 w-3 shrink-0" />}
          {label}
        </button>
        {error ? (
          <span role="alert" className="text-[10.5px] text-status-error-label">
            {error}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        aria-label={`Delete ${name}`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-status-error-border bg-status-error-bg px-3.5 py-2 text-[13px] font-medium text-status-error-label transition-colors hover:bg-status-error-border/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-error disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isDeleting ? <Spinner size={13} /> : <TrashIcon className="h-3.5 w-3.5 shrink-0" />}
        {label}
      </button>
      {error ? (
        <p role="alert" className="m-0 text-[12px] text-status-error-label">
          {error}
        </p>
      ) : null}
    </div>
  );
}
