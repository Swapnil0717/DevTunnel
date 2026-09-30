"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GithubProjectSummary } from "@/lib/github-projects/types";
import { AiSearchError, runAiCatalogSearch, type AiSearchResult } from "./search-client";

export type AiSearchStatus = "idle" | "loading" | "done" | "error";

export interface AiSearchFailure {
  message: string;
  /** Backend `error.code`, e.g. `unauthenticated`, `rate_limited`, `ai_disabled`. */
  code?: string;
  status?: number;
}

export interface AiSearchState<Row = GithubProjectSummary> {
  status: AiSearchStatus;
  /** The prompt of the most recent search (what the input is "about"). */
  prompt: string;
  /**
   * The last successful search. Kept while a refinement is loading or has
   * failed, so the page never blanks out from under the contributor; only
   * `clear()` removes it. `result !== null` is what "an AI search is
   * active" means.
   */
  result: AiSearchResult<Row> | null;
  error: AiSearchFailure | null;
  /** Runs a search; resolves with the result, or `null` if it failed, was superseded, or there is no catalog path. */
  search: (prompt: string) => Promise<AiSearchResult<Row> | null>;
  /** Re-runs the last prompt (the error state's "Try again"). */
  retry: () => Promise<AiSearchResult<Row> | null>;
  /** Cancels anything in flight and returns to the plain catalog. */
  clear: () => void;
}

function describeFailure(err: unknown): AiSearchFailure {
  if (err instanceof AiSearchError) {
    if (err.status === 401 || err.code === "unauthenticated") {
      return { message: "Sign in to use AI search.", code: "unauthenticated", status: err.status };
    }
    if (err.code === "ai_disabled") {
      return { message: "AI search is turned off right now.", code: err.code, status: err.status };
    }
    return { message: err.message, code: err.code, status: err.status };
  }
  return { message: "AI search failed. Try again." };
}

/**
 * State for one AI search bar (Parts 2 and 3). `path` is the list's backend
 * route (`"/github-projects"`, `"/github-open-source-tools"`, `"/projects"`,
 * `"/opensource-tools"`), or `null` when the page has no AI search (then
 * `search` is a no-op). `Row` is the row type that route returns — the
 * default is the GitHub catalogs' `GithubProjectSummary`.
 *
 * Safe against races the same way `useLoadFullCatalog` is: a new search or
 * `clear()` aborts the previous request, a superseded request can never
 * overwrite a newer one's state, and unmounting cancels anything in flight.
 */
export function useAiSearch<Row = GithubProjectSummary>(path: string | null): AiSearchState<Row> {
  const [status, setStatus] = useState<AiSearchStatus>("idle");
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState<AiSearchResult<Row> | null>(null);
  const [error, setError] = useState<AiSearchFailure | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const lastPromptRef = useRef("");

  useEffect(() => () => controllerRef.current?.abort(), []);

  const search = useCallback(
    async (nextPrompt: string): Promise<AiSearchResult<Row> | null> => {
      const trimmed = nextPrompt.trim();
      if (!path || trimmed.length < 2) return null;

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      lastPromptRef.current = trimmed;
      setPrompt(trimmed);
      setStatus("loading");
      setError(null);

      try {
        const next = await runAiCatalogSearch<Row>(path, trimmed, controller.signal);
        if (controller.signal.aborted) return null;
        setResult(next);
        setStatus("done");
        return next;
      } catch (err) {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return null;
        setError(describeFailure(err));
        setStatus("error");
        return null;
      }
    },
    [path],
  );

  const retry = useCallback(() => search(lastPromptRef.current), [search]);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    lastPromptRef.current = "";
    setPrompt("");
    setResult(null);
    setError(null);
    setStatus("idle");
  }, []);

  return { status, prompt, result, error, search, retry, clear };
}
