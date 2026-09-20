"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAdminProject } from "@/lib/admin/projects/client-api";
import { TrashIcon } from "@/components/layout/nav-icons";
import { Spinner } from "@/components/ui/spinner";

interface DeleteProjectButtonProps {
  projectId: string;
  projectName: string;
  variant?: "row" | "button";
  redirectTo?: string;
}

export function DeleteProjectButton({
  projectId,
  projectName,
  variant = "row",
  redirectTo,
}: DeleteProjectButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${projectName}" from DevTunnel? This removes the DevTunnel project — the GitHub repository itself is not affected.`,
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setIsDeleting(true);

    try {
      await deleteAdminProject(projectId);
      if (redirectTo) {
        router.push(redirectTo);
      }
      router.refresh();
    } catch {
      setError("Couldn't delete this project. Try again.");
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
          aria-label={`Delete ${projectName}`}
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
        aria-label={`Delete ${projectName}`}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium text-status-error-label transition-colors hover:bg-status-error-bg disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isDeleting ? <Spinner size={11} /> : null}
        {label}
      </button>
      {error ? <span className="text-[10.5px] text-status-error-label">{error}</span> : null}
    </span>
  );
}