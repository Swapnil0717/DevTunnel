"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchAllRepoIssues, RepoIssuesApiError } from "./repo-issues-client";

/**
 * Contributor-facing page size for a repository's issue list — the same
 * 10 `IssuesExplorer` (`/issues`) already uses, for the same reason: a
 * contributor browsing for something to pick up wants a short list per
 * page, not a wall. One constant so the four detail pages can't drift.
 */
export const REPO_ISSUES_PAGE_SIZE = 10;

export type LoadAllStatus = "idle" | "loading" | "loaded" | "error";

export interface LoadAllIssuesState<Row> {
  /** The preview the page shipped with, until "Load all issues" succeeds — then the complete list. */
  issues: Row[];
  status: LoadAllStatus;
  /** Only meaningful once `status === "loaded"` — see `RepoIssuesResult.truncated`. */
  truncated: boolean;
  errorMessage: string | null;
  /**
   * Whether there is (or may be) more to fetch — drives whether the
   * "Load all issues" action is offered at all. `false` for a
   * repository-less tool, for a repository whose preview already holds
   * everything GitHub reports, and once everything has been loaded.
   */
  canLoadMore: boolean;
  loadAll: () => void;
}

/**
 * Holds one repository's issue list for a detail page's Issues tab:
 * starts as the first-page preview the server-rendered page shipped with,
 * and swaps to the repository's complete open-issue list when
 * `loadAll()` succeeds.
 *
 * Lives in the *tabs* component rather than the issues panel on purpose.
 * The tab bodies are conditionally rendered, so the panel unmounts when
 * the contributor switches to README and back — state kept there would
 * throw away a list they had just waited for. Kept in the tabs component,
 * it survives tab switches, and the tab's own count badge can read the
 * same list the panel shows (rule 38: a count never disagrees with what
 * opening the tab displays).
 *
 * `openIssuesCount` is GitHub's own open-issue count for the repository.
 * It's only used as an *upper bound* to decide whether more might exist —
 * GitHub's number also counts open pull requests, so it can overstate the
 * true issue count, and this hook never displays it. Whether the list is
 * actually complete is only ever claimed from a real `loadAll()` result.
 *
 * `path` is `null` when there's nothing to load from (a tool that isn't a
 * GitHub repository).
 */
export function useLoadAllIssues<Row>({
  path,
  initialIssues,
  openIssuesCount,
}: {
  path: string | null;
  initialIssues: Row[];
  openIssuesCount: number;
}): LoadAllIssuesState<Row> {
  const [issues, setIssues] = useState<Row[]>(initialIssues);
  const [status, setStatus] = useState<LoadAllStatus>("idle");
  const [truncated, setTruncated] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Non-null exactly while a request is in flight: guards against a
  // double click firing two walks, and lets unmount cancel it.
  const inFlight = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      inFlight.current?.abort();
    },
    [],
  );

  const loadAll = useCallback(() => {
    if (!path || inFlight.current) return;

    const controller = new AbortController();
    inFlight.current = controller;
    setStatus("loading");
    setErrorMessage(null);

    fetchAllRepoIssues<Row>(path, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setIssues(result.issues);
        setTruncated(result.truncated);
        setStatus("loaded");
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setErrorMessage(
          err instanceof RepoIssuesApiError
            ? err.message
            : "Something went wrong while loading issues.",
        );
        setStatus("error");
      })
      .finally(() => {
        if (inFlight.current === controller) inFlight.current = null;
      });
  }, [path]);

  const canLoadMore = path !== null && status !== "loaded" && openIssuesCount > issues.length;

  return { issues, status, truncated, errorMessage, canLoadMore, loadAll };
}