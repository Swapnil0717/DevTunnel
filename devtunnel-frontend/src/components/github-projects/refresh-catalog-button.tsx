"use client";

import { RefreshIcon } from "@/components/layout/nav-icons";
import { Spinner } from "@/components/ui/spinner";
import type { LoadFullCatalogState } from "@/lib/github-projects/use-load-full-catalog";

/**
 * "Refresh" action on `/github-projects` and `/github-open-source-tools`
 * (`GithubProjectsExplorer`) — re-scans the live GitHub catalog right now
 * (`POST {path}/refresh`, `lib/github-projects/use-load-full-catalog.ts`)
 * instead of waiting on the backend's own ~25-30 minute warmer cadence, so
 * a contributor can pull in newly-trending or newly-created repositories
 * on demand. Same "action button + one-line result underneath" shape
 * `SyncAllIssuesButton` (admin's New Issues page) already uses, so a
 * manual refresh reads the same way anywhere in the app it appears.
 *
 * Deliberately its own small component rather than folded into
 * `LoadCatalogBar`: that bar is about *how much of the already-fetched
 * catalog is on screen* (pagination), this is about *how current the
 * catalog itself is* (freshness) — two different questions a contributor
 * can act on independently of each other.
 */
export function RefreshCatalogButton({
  loader,
  noun,
}: {
  loader: LoadFullCatalogState;
  noun: string;
}) {
  const { refreshStatus, refreshErrorMessage, refreshResultStatus, refresh } = loader;
  const isRefreshing = refreshStatus === "refreshing";

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={refresh}
        disabled={isRefreshing}
        title={`Fetch the latest trending and newest ${noun} from GitHub`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[12px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRefreshing ? (
          <Spinner size={13} />
        ) : (
          <RefreshIcon className="h-3.5 w-3.5 text-text-faint" />
        )}
        {isRefreshing ? "Refreshing…" : "Refresh"}
      </button>

      {refreshStatus === "error" ? (
        <p role="alert" className="m-0 text-[12px] text-status-error-label">
          {refreshErrorMessage ?? `Couldn't refresh ${noun}. Try again.`}
        </p>
      ) : null}

      {refreshStatus === "refreshed" ? (
        <p role="status" aria-live="polite" className="m-0 text-[12px] text-text-faint">
          {refreshResultStatus === "already-fresh"
            ? `Already up to date.`
            : `Refreshed with the latest ${noun} from GitHub.`}
        </p>
      ) : null}
    </div>
  );
}
