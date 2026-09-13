"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import {
  AdminProjectsApiError,
  syncAdminProjectGithubData,
} from "@/lib/admin/projects/client-api";

interface SyncProjectGithubDataButtonProps {
  projectId: string;
}

/**
 * Project Detail page's "Sync GitHub data" action (`POST
 * /admin/projects/:id/sync`).
 *
 * WHY THIS BUTTON EXISTS: GitHub contributors, stars, forks, primary
 * language, and open/closed issue counts are only ever captured once, at
 * Project Onboarding Step 1 — nothing re-fetches them automatically
 * afterward. A project onboarded a while ago (or before the open/closed
 * issue split existed) permanently shows whatever GitHub reported on
 * import day, which is exactly the "0 GitHub contributors" / "issue
 * counts don't match the repository" symptom this button fixes without
 * requiring the Admin to delete and re-run the whole onboarding wizard.
 *
 * Deliberately separate from `DeleteProjectButton`'s confirm-dialog
 * pattern — this is non-destructive (it only refreshes GitHub-sourced
 * counts, never touches the Admin's own description/tech-stack/status
 * choices), so no confirmation prompt is needed, same posture the
 * existing "Fetch latest README" action already takes.
 */
export function SyncProjectGithubDataButton({ projectId }: SyncProjectGithubDataButtonProps) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setIsSyncing(true);
    setError(null);
    try {
      await syncAdminProjectGithubData(projectId);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof AdminProjectsApiError
          ? "Couldn't sync GitHub data. Try again."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        onClick={handleSync}
        disabled={isSyncing}
        className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSyncing ? <Spinner size={13} /> : null}
        {isSyncing ? "Syncing…" : "Sync GitHub data"}
      </button>
      {error ? <p className="m-0 text-[12px] text-status-error-label">{error}</p> : null}
    </div>
  );
}
