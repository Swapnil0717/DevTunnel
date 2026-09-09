"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAdminTask } from "@/lib/admin/tasks/client-api";
import { TrashIcon } from "@/components/layout/nav-icons";

interface DeleteTaskButtonProps {
  taskId: string;
  taskTitle: string;
  /**
   * "row" — compact red text action for the Tasks table. "button" —
   * full-size red button for the Task Detail page's action bar. Same two
   * variants `DeleteProjectButton` offers.
   */
  variant?: "row" | "button";
  /**
   * Where to send the admin after a successful delete. The Detail page
   * passes `/admin/tasks`, since the page they're currently on stops
   * existing the moment the task is gone. The table omits this and just
   * refreshes the current list in place instead.
   */
  redirectTo?: string;
}

/**
 * `DELETE /admin/tasks/:id` (see `lib/admin/tasks/client-api.ts`).
 *
 * A native `window.confirm` guards the request — same reasoning
 * `DeleteProjectButton` documents: this codebase has no dialog/modal
 * component to reuse yet, and a plain confirm is fully keyboard- and
 * screen-reader-accessible without adding one just for a single
 * destructive action (Frontend_Development_Rules.txt rule 34).
 *
 * The confirmation copy is explicit that the GitHub issue survives this
 * (section 15: "The GitHub issue is not deleted just because the
 * DevTunnel representation is deleted") — so an admin isn't left
 * wondering whether they just deleted something off GitHub.
 *
 * On failure the button surfaces an inline message and re-enables itself
 * rather than leaving the admin looking at a dead button
 * (Frontend_Development_Rules.txt rule 26).
 */
export function DeleteTaskButton({
  taskId,
  taskTitle,
  variant = "row",
  redirectTo,
}: DeleteTaskButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${taskTitle}" from DevTunnel? This removes the DevTunnel task — the GitHub issue itself is not affected.`,
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setIsDeleting(true);

    try {
      await deleteAdminTask(taskId);
      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch {
      setError("Couldn't delete this task. Try again.");
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
          aria-label={`Delete ${taskTitle}`}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-status-error-border bg-status-error-bg px-4 py-2 text-[13px] font-medium text-status-error-label transition-colors hover:bg-status-error-border/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-error disabled:cursor-not-allowed disabled:opacity-60"
        >
          <TrashIcon className="h-3.5 w-3.5 shrink-0" />
          {label}
        </button>
        {error ? (
          <p className="m-0 text-[12px] text-status-error-label">{error}</p>
        ) : null}
      </div>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        aria-label={`Delete ${taskTitle}`}
        className="rounded-md px-2 py-1 text-[11.5px] font-medium text-status-error-label transition-colors hover:bg-status-error-bg disabled:cursor-not-allowed disabled:opacity-60"
      >
        {label}
      </button>
      {error ? (
        <span className="text-[10.5px] text-status-error-label">{error}</span>
      ) : null}
    </span>
  );
}