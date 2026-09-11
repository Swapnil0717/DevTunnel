"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

/**
 * Project Detail page (`/admin/projects/:id`) action that flips a
 * project between `ACTIVE` and `ARCHIVED` via `PATCH /admin/projects/:id`
 * (`updateAdminProject`, `AdminProjectUpdatePayload.status`) — the same
 * status the Projects table/detail page's `AdminProjectStatusBadge`
 * already displays, now editable rather than a fixed value the backend
 * alone could ever change.
 *
 * A native `window.confirm` guards the request, same convention as
 * `DeleteProjectButton` — this codebase has no dialog/modal component to
 * reuse yet, and a plain confirm is fully keyboard- and screen-reader-
 * accessible without adding one just for a single state-changing action
 * (Frontend_Development_Rules.txt rule 34).
 *
 * Archiving never touches GitHub or deletes anything — it only flips the
 * `devtunnel.projects.status` column (sql/006 + sql/019), same
 * "DevTunnel-only, repository untouched" framing `DeleteProjectButton`
 * already uses for its own action.
 *
 * On failure the button surfaces an inline message and re-enables itself
 * rather than leaving the admin looking at a dead button
 * (Frontend_Development_Rules.txt rule 26), same pattern as
 * `DeleteProjectButton`/`LogoutButton`.
 */
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
        {isSaving ? savingLabel : actionLabel}
      </button>
      {error ? <p className="m-0 text-[12px] text-status-error-label">{error}</p> : null}
    </div>
  );
}
