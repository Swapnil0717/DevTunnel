"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import {
  AiSummaryError,
  fetchAiSummary,
  getCachedAiSummary,
  type AiSummaryKind,
  type AiSummaryResponse,
} from "./summary-client";

export type AiSummaryStatus = "loading" | "done" | "error";

export interface AiSummaryFailure {
  message: string;
  /** Backend `error.code`, e.g. `unauthenticated`, `ai_disabled`, `not_enough_content`, `rate_limited`, `ai_unavailable`. */
  code?: string;
  status?: number;
}

export interface AiSummaryState {
  status: AiSummaryStatus;
  data: AiSummaryResponse | null;
  error: AiSummaryFailure | null;
  /** Asks again (the error state's "Try again"). */
  retry: () => void;
}

function describeFailure(err: unknown): AiSummaryFailure {
  if (err instanceof AiSummaryError) {
    if (err.status === 401 || err.code === "unauthenticated") {
      return { message: "Sign in to use AI.", code: "unauthenticated", status: err.status };
    }
    return { message: err.message, code: err.code, status: err.status };
  }
  return { message: "The AI summary couldn't be loaded. Try again." };
}

/** Codes where asking again can't help (the switch is off, or there's nothing to summarise). */
export function isPermanentSummaryFailure(error: AiSummaryFailure | null): boolean {
  return error?.code === "ai_disabled" || error?.code === "not_enough_content" || error?.code === "unauthenticated";
}

/**
 * Loads one page's AI summary AFTER the page has rendered (the detail pages
 * stay server-rendered exactly as before; the summary is an add-on).
 *
 * Waits for the auth check, then makes one `POST /ai/summary`. It never asks
 * while signed out — the endpoint is signed-in only because it can spend a
 * free-tier AI budget — and reports `unauthenticated` so the card can show a
 * sign-in prompt instead of a request that could only fail. A page revisited
 * in the same tab reuses the result in memory.
 */
export function useAiSummary(kind: AiSummaryKind, subjectKey: string): AiSummaryState {
  const { status: authStatus } = useAuth();
  const [state, setState] = useState<Omit<AiSummaryState, "retry">>(() => {
    const cached = getCachedAiSummary(kind, subjectKey);
    return cached ? { status: "done", data: cached, error: null } : { status: "loading", data: null, error: null };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (authStatus === "unauthenticated") {
      setState({ status: "error", data: null, error: describeFailure(new AiSummaryError("", 401, "unauthenticated")) });
      return;
    }

    const cached = getCachedAiSummary(kind, subjectKey);
    if (cached) {
      setState({ status: "done", data: cached, error: null });
      return;
    }

    const controller = new AbortController();
    setState({ status: "loading", data: null, error: null });
    fetchAiSummary(kind, subjectKey, controller.signal)
      .then((data) => setState({ status: "done", data, error: null }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setState({ status: "error", data: null, error: describeFailure(err) });
      });

    return () => controller.abort();
  }, [kind, subjectKey, authStatus, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
