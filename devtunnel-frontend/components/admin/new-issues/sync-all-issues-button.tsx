"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { AdminNewIssuesApiError, syncAllAdminNewIssues } from "@/lib/admin/new-issues/client-api";

/**
 * "Sync all issues" action, shown on both `/admin/tasks/new-issues` and
 * `/admin/tasks/new-issues/since-onboarding`.
 *
 * `GET /admin/new-issues` serves most requests from a short-lived
 * server-side cache of the last live GitHub scan
 * (`GithubScanCacheEntry`, src/routes/admin/newIssues.ts) — a plain
 * server render (`cache: "no-store"` here just means *this browser*
 * doesn't cache the response; it says nothing about the backend) can
 * therefore return data that's up to a few minutes old. This button's
 * job is to let the Admin force a real live cross-project GitHub
 * re-scan on demand (`syncAllAdminNewIssues`'s `refresh=true` on its
 * first request) and see a concrete result (how many issues, across
 * how many projects) before refreshing the page, the same
 * "refresh + report a summary" pattern
 * `SyncAllProjectsGithubDataButton` already uses on the Projects page.
 */
export function SyncAllIssuesButton() {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleSync() {
    setIsSyncing(true);
    setMessage(null);
    setIsError(false);
    try {
      const summary = await syncAllAdminNewIssues();
      setMessage(
        `Synced ${summary.issueCount} issue${summary.issueCount === 1 ? "" : "s"} across ${summary.projectCount} project${summary.projectCount === 1 ? "" : "s"}.`,
      );
      router.refresh();
    } catch (err) {
      setIsError(true);
      setMessage(
        err instanceof AdminNewIssuesApiError
          ? "Couldn't sync issues from GitHub. Try again."
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
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSyncing ? <Spinner size={13} /> : null}
        {isSyncing ? "Syncing…" : "Sync all issues"}
      </button>
      {message ? (
        <p className={`m-0 text-[12px] ${isError ? "text-status-error-label" : "text-text-muted"}`}>
          {message}
        </p>
      ) : null}
    </div>
  );
}