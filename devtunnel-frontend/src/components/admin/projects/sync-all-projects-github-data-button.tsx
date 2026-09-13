"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import {
  AdminProjectsApiError,
  syncAllAdminProjectsGithubData,
} from "@/lib/admin/projects/client-api";

/**
 * All Projects page's "Sync GitHub data" action, next to "Onboard a
 * project" (`POST /admin/projects/sync-all`).
 *
 * Does exactly the same work as `SyncProjectGithubDataButton` on the
 * Project Detail page — re-fetches contributors, stars, forks, primary
 * language, and open/closed issue counts from GitHub and overwrites
 * those columns — just for every active project in one click instead of
 * one at a time. Same non-destructive posture as the single-project
 * button (only GitHub-sourced counts change, never an Admin's own
 * description/tech-stack/status choices), so no confirm dialog here
 * either.
 *
 * Reports a short summary after it finishes rather than just a generic
 * success/failure — with dozens of projects, "it worked" or "it failed"
 * isn't enough to act on; the Admin needs to know whether a handful of
 * projects were skipped so they can check those individually.
 */
export function SyncAllProjectsGithubDataButton() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleSyncAll() {
    setIsSyncing(true);
    setMessage(null);
    setIsError(false);
    try {
      const result = await syncAllAdminProjectsGithubData();
      if (result.failed.length === 0) {
        setMessage(`Synced ${result.synced} of ${result.total} project${result.total === 1 ? "" : "s"}.`);
      } else {
        setIsError(true);
        setMessage(
          `Synced ${result.synced} of ${result.total} project${result.total === 1 ? "" : "s"} — ${result.failed.length} couldn't be synced.`,
        );
      }
      router.refresh();
    } catch (err) {
      setIsError(true);
      setMessage(
        err instanceof AdminProjectsApiError
          ? "Couldn't sync projects' GitHub data. Try again."
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
        onClick={handleSyncAll}
        disabled={isSyncing}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSyncing ? <Spinner size={13} /> : null}
        {isSyncing ? "Syncing…" : "Sync GitHub data"}
      </button>
      {message ? (
        <p className={`m-0 text-[12px] ${isError ? "text-status-error-label" : "text-text-muted"}`}>{message}</p>
      ) : null}
    </div>
  );
}
