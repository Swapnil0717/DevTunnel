"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAdminOpenSourceTool } from "@/lib/admin/opensource-tools/client-api";
import { TrashIcon } from "@/components/layout/nav-icons";
import { Spinner } from "@/components/ui/spinner";

interface DeleteOpenSourceToolButtonProps {
  toolId: string;
  toolName: string;
  variant?: "card" | "button";
  redirectTo?: string;
}

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
          {isDeleting ? <Spinner size={13} /> : <TrashIcon className="h-3.5 w-3.5 shrink-0" />}
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
        {isDeleting ? <Spinner size={11} /> : <TrashIcon className="h-3 w-3 shrink-0" />}
        {label}
      </button>
      {error ? <span className="text-[10px] text-status-error-label">{error}</span> : null}
    </span>
  );
}