"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LoadAllStatus } from "./use-load-all-issues";
import { IssuesLoadError, fetchAllIssues } from "./client-api";
import type { Issue } from "./types";

export interface LoadIssueListState {
  /** The server-rendered preview until "Load all issues" succeeds — then the complete list. */
  issues: Issue[];
  status: LoadAllStatus;
  errorMessage: string | null;
  /** Whether the "Load all issues" action should be offered — `false` when the preview already holds everything, and once everything is loaded. */
  canLoadAll: boolean;
  loadAll: () => void;
}

/**
 * Holds the list `IssuesExplorer` (`/issues`) searches, filters and
 * pages over: starts as the first-page preview the server component
 * shipped with, and swaps to the full list when `loadAll()` succeeds.
 * Same shape as `useLoadFullCatalog` (`lib/github-projects/`) and
 * `useLoadAllIssues` (`./use-load-all-issues.ts`), for the same reasons —
 * a double click can't start two walks, unmounting cancels an in-flight
 * one, and a failure leaves the preview on screen with a retry rather
 * than blanking the page.
 *
 * `hasMore` is the server's word that issues exist past the preview —
 * the button is only offered when it's true, so it never appears on a
 * list that was already complete.
 *
 * When the server hands down a new `initialIssues` (a `router.refresh()`
 * after the page failed once, say), everything here resets to that new
 * preview and any in-flight request is cancelled.
 */
export function useLoadIssueList({
  initialIssues,
  hasMore,
}: {
  initialIssues: Issue[];
  hasMore: boolean;
}): LoadIssueListState {
  const [issues, setIssues] = useState<Issue[]>(initialIssues);
  const [status, setStatus] = useState<LoadAllStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Adjust state during render (React's documented pattern for "reset
  // when a prop changes") rather than in an effect, so a stale list is
  // never painted for a frame under a new preview.
  const [source, setSource] = useState(initialIssues);
  if (source !== initialIssues) {
    setSource(initialIssues);
    setIssues(initialIssues);
    setStatus("idle");
    setErrorMessage(null);
  }

  // Non-null exactly while a request is in flight.
  const inFlight = useRef<AbortController | null>(null);

  // Cleanup runs on unmount and whenever the server sends a new preview.
  useEffect(
    () => () => {
      inFlight.current?.abort();
      inFlight.current = null;
    },
    [initialIssues],
  );

  const loadAll = useCallback(() => {
    if (inFlight.current) return;

    const controller = new AbortController();
    inFlight.current = controller;
    setStatus("loading");
    setErrorMessage(null);

    fetchAllIssues(controller.signal)
      .then((full) => {
        if (controller.signal.aborted) return;
        setIssues(full);
        setStatus("loaded");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          err instanceof IssuesLoadError
            ? err.message
            : "Something went wrong while loading the full list.",
        );
        setStatus("error");
      })
      .finally(() => {
        if (inFlight.current === controller) inFlight.current = null;
      });
  }, []);

  const canLoadAll = hasMore && status !== "loaded";

  return { issues, status, errorMessage, canLoadAll, loadAll };
}
