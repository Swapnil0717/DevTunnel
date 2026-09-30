"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CatalogLoadError, fetchFullCatalog } from "./catalog-client";
import { bucketsForRange } from "./star-buckets";
import type { GithubProjectSummary } from "./types";

export type StarRangeStatus = "idle" | "loading" | "loaded" | "error";

export interface StarRangeCatalogState {
  /** `true` while a star range is selected and this hook owns the list. */
  active: boolean;
  status: StarRangeStatus;
  /** Rows from every bucket loaded so far (grows while `status === "loading"`). */
  projects: GithubProjectSummary[];
  errorMessage: string | null;
  /** Buckets loaded / needed — for "Loading 2 of 3…" copy. */
  loadedBuckets: number;
  totalBuckets: number;
  retry: () => void;
}

/**
 * Loads the projects for the selected Minimum/Maximum stars range from the
 * server, one star bucket at a time (`GET /github-projects?filter=stars-…`,
 * see `star-buckets.ts`). This is what makes those two filters work: the
 * unfiltered catalog only holds the ~1,000 most-starred repositories, so a
 * range like "under 100 stars" has to be fetched, not filtered.
 *
 * - Buckets load sequentially and rows appear as each one lands, so the grid
 *   isn't blank while the later buckets load.
 * - Loaded buckets are kept in a ref, so switching between ranges that share
 *   buckets never re-downloads them.
 * - Changing the range (or unmounting) aborts the in-flight walk.
 * - Does nothing when `path` is null or the range is unbounded (`active` is
 *   `false`) — the explorer then uses the ordinary catalog.
 */
export function useStarRangeCatalog({
  path,
  minStars,
  maxStars,
}: {
  path: string | null;
  minStars: number;
  maxStars: number;
}): StarRangeCatalogState {
  const buckets = useMemo(() => bucketsForRange(minStars, maxStars), [minStars, maxStars]);
  const bucketKeys = useMemo(() => buckets.map((bucket) => bucket.key), [buckets]);
  const active = path !== null && bucketKeys.length > 0;

  const cache = useRef(new Map<string, GithubProjectSummary[]>());
  const [projects, setProjects] = useState<GithubProjectSummary[]>([]);
  const [status, setStatus] = useState<StarRangeStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadedBuckets, setLoadedBuckets] = useState(0);
  const [attempt, setAttempt] = useState(0);

  const keySignature = bucketKeys.join("|");

  useEffect(() => {
    if (!active || !path) {
      setStatus("idle");
      setProjects([]);
      setErrorMessage(null);
      setLoadedBuckets(0);
      return;
    }

    const controller = new AbortController();
    const keys = keySignature.split("|");
    const merged = new Map<string, GithubProjectSummary>();
    let loaded = 0;

    function publish() {
      setProjects(Array.from(merged.values()));
      setLoadedBuckets(loaded);
    }

    // Anything already downloaded shows immediately.
    for (const key of keys) {
      const hit = cache.current.get(key);
      if (!hit) continue;
      for (const row of hit) merged.set(row.id, row);
      loaded += 1;
    }
    publish();
    setErrorMessage(null);

    if (loaded === keys.length) {
      setStatus("loaded");
      return;
    }

    setStatus("loading");

    (async () => {
      for (const key of keys) {
        if (cache.current.has(key)) continue;
        const rows = await fetchFullCatalog(path, { filter: key, signal: controller.signal });
        if (controller.signal.aborted) return;
        cache.current.set(key, rows);
        for (const row of rows) merged.set(row.id, row);
        loaded += 1;
        publish();
      }
      setStatus("loaded");
    })().catch((err: unknown) => {
      if (controller.signal.aborted) return;
      setErrorMessage(
        err instanceof CatalogLoadError
          ? err.message
          : "Something went wrong while loading this star range.",
      );
      setStatus("error");
    });

    return () => controller.abort();
  }, [active, path, keySignature, attempt]);

  return {
    active,
    status,
    projects,
    errorMessage,
    loadedBuckets,
    totalBuckets: bucketKeys.length,
    retry: () => setAttempt((n) => n + 1),
  };
}
