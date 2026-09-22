"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LoadAllStatus } from "@/lib/issues/use-load-all-issues";
import { CatalogLoadError, fetchFullCatalog, refreshCatalog } from "./catalog-client";
import type { GithubProjectSummary } from "./types";

/**
 * The "Refresh" button's own state — deliberately separate from `status`
 * (the "Load all" state) even though both ultimately update the same
 * `projects` array: they're two independent user actions that can each be
 * mid-flight on their own schedule, and conflating them would make a
 * "Load all" spinner show while a refresh is running (or vice versa).
 */
export type RefreshStatus = "idle" | "refreshing" | "refreshed" | "error";

export interface LoadFullCatalogState {
  /** The server-rendered preview until "Load all" succeeds — then the complete catalog. */
  projects: GithubProjectSummary[];
  status: LoadAllStatus;
  errorMessage: string | null;
  /** Whether the "Load all" action should be offered — `false` when the preview already holds everything, and once everything is loaded. */
  canLoadAll: boolean;
  loadAll: () => void;
  refreshStatus: RefreshStatus;
  refreshErrorMessage: string | null;
  /**
   * `"refreshed"` after a scan actually ran; `"already-fresh"` when a very
   * recent refresh made another scan unnecessary — both mean the catalog
   * is current, but the button's copy tells them apart (see
   * `RefreshCatalogButton`).
   */
  refreshResultStatus: "refreshed" | "already-fresh" | null;
  /** Re-scans this catalog against GitHub right now and reloads `projects` with the result. No-op while a refresh is already in flight. */
  refresh: () => void;
}

/**
 * Holds the list `GithubProjectsExplorer` searches, filters and pages
 * over: starts as the first-page preview the server component shipped
 * with, and swaps to the whole catalog when `loadAll()` succeeds. Same
 * shape as `useLoadAllIssues` (`lib/issues/use-load-all-issues.ts`), for
 * the same reasons — a double click can't start two walks, unmounting
 * cancels an in-flight one, and a failure leaves the preview on screen
 * with a retry rather than blanking the page.
 *
 * `path` is `null` when the caller has no catalog to load from, and
 * `hasMore` is the server's word that rows exist past the preview — the
 * button is only offered when both hold, so it never appears on a catalog
 * that was already complete.
 *
 * When the server hands down a new `initialProjects` (the tools page
 * re-fetching after its "Show" filter changes), everything here resets to
 * that new preview: a list loaded for the previous filter must never be
 * shown under the new one, and its in-flight request is cancelled.
 */
export function useLoadFullCatalog({
  path,
  filter,
  initialProjects,
  hasMore,
}: {
  path: string | null;
  filter?: string;
  initialProjects: GithubProjectSummary[];
  hasMore: boolean;
}): LoadFullCatalogState {
  const [projects, setProjects] = useState<GithubProjectSummary[]>(initialProjects);
  const [status, setStatus] = useState<LoadAllStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>("idle");
  const [refreshErrorMessage, setRefreshErrorMessage] = useState<string | null>(null);
  const [refreshResultStatus, setRefreshResultStatus] = useState<
    "refreshed" | "already-fresh" | null
  >(null);

  // Adjust state during render (React's documented pattern for "reset
  // when a prop changes") rather than in an effect, so the previous
  // catalog is never painted for a frame under the new one.
  const [source, setSource] = useState(initialProjects);
  if (source !== initialProjects) {
    setSource(initialProjects);
    setProjects(initialProjects);
    setStatus("idle");
    setErrorMessage(null);
    setRefreshStatus("idle");
    setRefreshErrorMessage(null);
    setRefreshResultStatus(null);
  }

  // Non-null exactly while a "Load all" request is in flight.
  const inFlight = useRef<AbortController | null>(null);
  // Non-null exactly while a "Refresh" request (scan + reload) is in flight.
  const refreshInFlight = useRef<AbortController | null>(null);

  // Cleanup runs on unmount and whenever the server sends a new preview.
  useEffect(
    () => () => {
      inFlight.current?.abort();
      inFlight.current = null;
      refreshInFlight.current?.abort();
      refreshInFlight.current = null;
    },
    [initialProjects],
  );

  const loadAll = useCallback(() => {
    if (!path || inFlight.current) return;

    const controller = new AbortController();
    inFlight.current = controller;
    setStatus("loading");
    setErrorMessage(null);

    fetchFullCatalog(path, { filter, signal: controller.signal })
      .then((full) => {
        if (controller.signal.aborted) return;
        setProjects(full);
        setStatus("loaded");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          err instanceof CatalogLoadError
            ? err.message
            : "Something went wrong while loading the full list.",
        );
        setStatus("error");
      })
      .finally(() => {
        if (inFlight.current === controller) inFlight.current = null;
      });
  }, [path, filter]);

  const canLoadAll = path !== null && hasMore && status !== "loaded";

  /**
   * Re-scans this catalog against GitHub right now
   * (`POST {path}/refresh`) and, on success, reloads `projects` with the
   * result (`fetchFullCatalog`) so the grid reflects it immediately —
   * without that second step the backend's cache would be current but
   * this component would keep showing whatever it already had in memory.
   */
  const refresh = useCallback(() => {
    if (!path || refreshInFlight.current) return;

    const controller = new AbortController();
    refreshInFlight.current = controller;
    setRefreshStatus("refreshing");
    setRefreshErrorMessage(null);

    refreshCatalog(path, { filter, signal: controller.signal })
      .then((result) =>
        fetchFullCatalog(path, { filter, signal: controller.signal }).then((full) => ({
          result,
          full,
        })),
      )
      .then(({ result, full }) => {
        if (controller.signal.aborted) return;
        setProjects(full);
        // `fetchFullCatalog` above already walked every page of the
        // now-refreshed catalog, so it's complete the same way a
        // successful "Load all" leaves it — keeps `LoadCatalogBar` from
        // still offering "Load all N" underneath the freshly-refreshed
        // grid.
        setStatus("loaded");
        setErrorMessage(null);
        setRefreshResultStatus(result.status);
        setRefreshStatus("refreshed");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setRefreshErrorMessage(
          err instanceof CatalogLoadError
            ? err.message
            : "Something went wrong while refreshing.",
        );
        setRefreshStatus("error");
      })
      .finally(() => {
        if (refreshInFlight.current === controller) refreshInFlight.current = null;
      });
  }, [path, filter]);

  return {
    projects,
    status,
    errorMessage,
    canLoadAll,
    loadAll,
    refreshStatus,
    refreshErrorMessage,
    refreshResultStatus,
    refresh,
  };
}
