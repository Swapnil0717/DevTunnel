"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@/components/layout/nav-icons";
import { Spinner } from "@/components/ui/spinner";
import { SubmissionsApiError, deleteSubmission } from "@/lib/submissions/client-api";

interface DeleteSubmissionButtonProps {
  slug: string;
  name: string;
  /** `card` — compact, for a Community list row. `button` — larger, for the view page header. */
  variant?: "card" | "button";
  /** Called after a successful delete (the list uses it to drop the row without a reload). */
  onDeleted?: (slug: string) => void;
  /** Where to go after deleting (the view page sends the owner back to Community). */
  redirectTo?: string;
}

/**
 * "Delete" for a Community submission — rendered only for the person who
 * submitted it (`ownedByViewer`). The backend (`DELETE /submissions/:slug`)
 * enforces ownership independently, so hiding this button is a courtesy,
 * never the protection.
 *
 * Deleting asks first (`window.confirm`, same convention as the admin
 * delete buttons) and says what it does and doesn't do: the submission
 * leaves Community, but the GitHub repository is untouched and can be
 * submitted again. While the request runs the button is disabled with a
 * spinner; a failure shows the backend's own message and leaves everything
 * where it was. The state is always the word "Delete"/"Deleting…" as well as
 * the icon (rule 43).
 *
 * On success: `onDeleted` fires (the list drops the row), then, when
 * `redirectTo` is given, the page navigates there; either way the route is
 * refreshed so server-rendered data never shows the removed entry.
 */
export function DeleteSubmissionButton({
  slug,
  name,
  variant = "card",
  onDeleted,
  redirectTo,
}: DeleteSubmissionButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (isDeleting) return;

    const confirmed = window.confirm(
      `Delete "${name}" from Community? It will be removed from the list for everyone, along with its upvotes. Your GitHub repository isn't affected, and you can submit it again later.`,
    );
    if (!confirmed) return;

    setError(null);
    setIsDeleting(true);

    try {
      await deleteSubmission(slug);
      onDeleted?.(slug);
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof SubmissionsApiError && err.status !== 500
          ? err.message
          : "Couldn't delete this submission. Check your connection and try again.",
      );
      setIsDeleting(false);
    }
  }

  const label = isDeleting ? "Deleting…" : "Delete";

  if (variant === "button") {
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
          <p role="alert" className="m-0 max-w-[260px] text-[12px] text-status-error-label">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <span className="relative z-10 inline-flex flex-col items-end gap-0.5">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        aria-label={`Delete ${name}`}
        className="inline-flex items-center gap-1 rounded-[6px] border border-border-subtle px-2 py-1 text-[11.5px] text-text-dim transition-colors hover:border-status-error-border hover:bg-status-error-bg hover:text-status-error-label disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isDeleting ? <Spinner size={11} /> : <TrashIcon className="h-3 w-3 shrink-0" />}
        {label}
      </button>
      {error ? (
        <span role="alert" className="max-w-[220px] text-right text-[10.5px] text-status-error-label">
          {error}
        </span>
      ) : null}
    </span>
  );
}
