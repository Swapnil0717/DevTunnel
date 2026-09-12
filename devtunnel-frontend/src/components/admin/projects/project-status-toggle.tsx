"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import {
  AdminProjectsApiError,
  updateAdminProject,
} from "@/lib/admin/projects/client-api";
import type { AdminProjectStatus } from "@/lib/admin/projects/types";

interface ProjectStatusToggleProps {
  projectId: string;
  projectName: string;
  status: AdminProjectStatus;
}

export function ProjectStatusToggle({
  projectId,
  projectName,
  status,
}: ProjectStatusToggleProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextStatus: AdminProjectStatus = status === "ACTIVE" ? "ARCHIVED" : "ACTIVE";
  const actionLabel = status === "ACTIVE" ? "Archive project" : "Reactivate project";
  const savingLabel = status === "ACTIVE" ? "Archiving…" : "Reactivating…";

  async function handleToggle() {
    const confirmed = window.confirm(
      status === "ACTIVE"
        ? `Archive "${projectName}"? It will be marked inactive across the Admin Portal — the GitHub repository itself is not affected.`
        : `Reactivate "${projectName}"? It will be marked active again across the Admin Portal.`,
    );
    if (!confirmed) {
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      await updateAdminProject(projectId, { status: nextStatus });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof AdminProjectsApiError
          ? "Couldn't update this project's status. Try again."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const activeClasses =
    "border-status-error-border bg-status-error-bg text-status-error-label hover:bg-status-error-border/40";
  const archivedClasses =
    "border-status-success-border bg-status-success-bg text-status-success-label hover:bg-status-success-border/40";

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleToggle}
        disabled={isSaving}
        aria-label={`${actionLabel}: ${projectName}`}
        className={`inline-flex items-center gap-1.5 rounded-[8px] border px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${
          status === "ACTIVE" ? activeClasses : archivedClasses
        }`}
      >
        {isSaving ? <Spinner size={13} /> : null}
        {isSaving ? savingLabel : actionLabel}
      </button>
      {error ? <p className="m-0 text-[12px] text-status-error-label">{error}</p> : null}
    </div>
  );
}