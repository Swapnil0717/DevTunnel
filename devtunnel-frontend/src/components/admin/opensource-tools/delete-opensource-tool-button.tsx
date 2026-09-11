"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAdminOpenSourceTool } from "@/lib/admin/opensource-tools/client-api";
import { TrashIcon } from "@/components/layout/nav-icons";

interface DeleteOpenSourceToolButtonProps {
  toolId: string;
  toolName: string;
  /**
   * "card" — compact red text action in the grid card's footer row
   * (`/admin/opensource-tools`). "button" — full-size red button for the
   * tool detail page's action bar. Same split `DeleteProjectButton`
   * makes between its table row and Project Detail variants.
   */
  variant?: "card" | "button";
  /**
   * Where to send the admin after a successful delete. The detail page
   * passes `/admin/opensource-tools`, since the page they're on stops
   * existing the moment the tool is gone. The grid card omits this and
   * just refreshes the current list in place instead.
   */
  redirectTo?: string;
}

/**
 * `DELETE /admin/opensource-tools/:id` (see
 * `lib/admin/opensource-tools/client-api.ts`).
 *
 * A native `window.confirm` guards the request, same reasoning
 * `DeleteProjectButton` documents — no dialog/modal component exists yet
 * in this codebase, and a plain confirm is fully keyboard- and
 * screen-reader-accessible without adding one just for a single
 * destructive action (Frontend_Development_Rules.txt rule 34).
 *
 * On failure the button surfaces an inline message and re-enables
 * itself rather than leaving the admin looking at a dead button (rule
 * 26 — proper error states, no silent/blank failures).
 */
export function DeleteOpenSourceToolButton({
  toolId,
  toolName,
  variant = "card",
  redirectTo,
}: DeleteOpenSourceToolButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${toolName}" from the Open Source Tools catalog? This only removes the DevTunnel listing — the tool's own site or repository is not affected.`,
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setIsDeleting(true);

    try {
      await deleteAdminOpenSourceTool(toolId);
      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch {
      setError("Couldn't delete this tool. Try again.");
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
          aria-label={`Delete ${toolName}`}
          className="inline-flex items-center gap-1.5 rounded-[8px] border border-status-error-border bg-status-error-bg px-4 py-2 text-[13px] font-medium text-status-error-label transition-colors hover:bg-status-error-border/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-error disabled:cursor-not-allowed disabled:opacity-60"
        >
          <TrashIcon className="h-3.5 w-3.5 shrink-0" />
          {label}
        </button>
        {error ? <p className="m-0 text-[12px] text-status-error-label">{error}</p> : null}
      </div>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        aria-label={`Delete ${toolName}`}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-status-error-label transition-colors hover:bg-status-error-bg disabled:cursor-not-allowed disabled:opacity-60"
      >
        <TrashIcon className="h-3 w-3 shrink-0" />
        {label}
      </button>
      {error ? <span className="text-[10px] text-status-error-label">{error}</span> : null}
    </span>
  );
}