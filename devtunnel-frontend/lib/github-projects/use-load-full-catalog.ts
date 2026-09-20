"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LoadAllStatus } from "@/lib/issues/use-load-all-issues";
import { CatalogLoadError, fetchFullCatalog } from "./catalog-client";
import type { GithubProjectSummary } from "./types";

export interface LoadFullCatalogState {
  /** The server-rendered preview until "Load all" succeeds — then the complete catalog. */
  projects: GithubProjectSummary[];
  status: LoadAllStatus;
  errorMessage: string | null;
  /** Whether the "Load all" action should be offered — `false` when the preview already holds everything, and once everything is loaded. */
  canLoadAll: boolean;
  loadAll: () => void;
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

  // Adjust state during render (React's documented pattern for "reset
  // when a prop changes") rather than in an effect, so the previous
  // catalog is never painted for a frame under the new one.
  const [source, setSource] = useState(initialProjects);
  if (source !== initialProjects) {
    setSource(initialProjects);
    setProjects(initialProjects);
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

  return { projects, status, errorMessage, canLoadAll, loadAll };
}
