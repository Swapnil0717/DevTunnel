"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import type { DeveloperRole, ExperienceLevel } from "@/lib/onboarding/types";
import {
  fetchAiIssueInsights,
  fillInsightGaps,
  getCachedAiInsights,
  isAbortError,
  toInsightsFailure,
  type AiInsightIssue,
  type AiIssueInsightsResponse,
  type InsightsFailure,
} from "@/lib/ai/insights-client";

export type { InsightsFailure } from "@/lib/ai/insights-client";

export type InsightsStatus = "idle" | "loading" | "done" | "error";

export interface InsightFilters {
  roles: DeveloperRole[];
  levels: ExperienceLevel[];
  /** Canonical technology names, compared case-insensitively. */
  tech: string[];
}

const NO_FILTERS: InsightFilters = { roles: [], levels: [], tech: [] };

const LEVEL_RANK: Record<ExperienceLevel, number> = { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 2 };

function toggled<T>(list: T[], value: T, same: (a: T, b: T) => boolean = (a, b) => a === b): T[] {
  return list.some((item) => same(item, value)) ? list.filter((item) => !same(item, value)) : [...list, value];
}

// ---------------------------------------------------------------------------
// Pieces shared with the All Issues page (`use-issues-page-insights.ts`)
// ---------------------------------------------------------------------------

/** The role / level / tech chip selection and its toggles. */
export function useInsightFilters() {
  const [filters, setFilters] = useState<InsightFilters>(NO_FILTERS);
  const activeFilterCount = filters.roles.length + filters.levels.length + filters.tech.length;

  const toggleRole = useCallback((role: DeveloperRole) => setFilters((f) => ({ ...f, roles: toggled(f.roles, role) })), []);
  const toggleLevel = useCallback((level: ExperienceLevel) => setFilters((f) => ({ ...f, levels: toggled(f.levels, level) })), []);
  const toggleTech = useCallback(
    (name: string) => setFilters((f) => ({ ...f, tech: toggled(f.tech, name, (a, b) => a.toLowerCase() === b.toLowerCase()) })),
    [],
  );
  const clearFilters = useCallback(() => setFilters(NO_FILTERS), []);

  return { filters, activeFilterCount, toggleRole, toggleLevel, toggleTech, clearFilters };
}

/** Whether one analysed issue passes every active group (roles, levels, tech — within a group any one may match). */
export function entryMatchesFilters(entry: Pick<AiInsightIssue, "role" | "level" | "techStack">, filters: InsightFilters): boolean {
  if (filters.roles.length > 0 && !filters.roles.includes(entry.role)) return false;
  if (filters.levels.length > 0 && !filters.levels.includes(entry.level)) return false;
  if (filters.tech.length > 0) {
    const wanted = filters.tech.map((name) => name.toLowerCase());
    if (!entry.techStack.some((name) => wanted.includes(name.toLowerCase()))) return false;
  }
  return true;
}

/** The viewer's onboarding answers and the two "matches you" checks. No AI call — it only compares labels. */
export function useViewerInsightMatch() {
  const { user } = useAuth();
  const viewerRoles = useMemo<DeveloperRole[]>(() => user?.developerRoles ?? [], [user]);
  const viewerLevel: ExperienceLevel | null = user?.experienceLevel ?? null;

  const matchesViewerRole = useCallback(
    (issue: Pick<AiInsightIssue, "role">): boolean => {
      if (viewerRoles.length === 0) return false;
      if (viewerRoles.includes(issue.role)) return true;
      // Same convention as the Tasks explorer: a full-stack developer isn't narrowed to one side.
      return viewerRoles.includes("FULL_STACK") && (issue.role === "FRONTEND" || issue.role === "BACKEND");
    },
    [viewerRoles],
  );

  const fitsViewerLevel = useCallback(
    (issue: Pick<AiInsightIssue, "level">): boolean => viewerLevel !== null && LEVEL_RANK[issue.level] <= LEVEL_RANK[viewerLevel],
    [viewerLevel],
  );

  return { viewerRoles, viewerLevel, matchesViewerRole, fitsViewerLevel };
}

// ---------------------------------------------------------------------------
// The Issues tab of a repository page
// ---------------------------------------------------------------------------

/** Progress of the "analyze the issues that have no insight yet" step that follows the first analysis. */
export interface InsightFillState {
  /** Batches are being requested right now (or are about to be). */
  running: boolean;
  /** The failure that stopped the last run (the batches before it stay on screen); `null` when there is none. */
  error: InsightsFailure | null;
  /** Loaded open issues that still have no insight and haven't been asked about yet. */
  pending: number;
  /** Loaded open issues that still have no insight — includes ones the AI's answer was unusable for. */
  notAnalyzed: number;
  /** Loaded open issues in total. */
  openCount: number;
}

/** The state the Issues tab shares between the insights card, the filter chips and the issue rows. */
export interface IssueInsightsController {
  /** `owner/repo`, or `null` when the page has no GitHub repository (then nothing AI is shown). */
  repo: string | null;
  authStatus: "loading" | "authenticated" | "unauthenticated";
  status: InsightsStatus;
  data: AiIssueInsightsResponse | null;
  error: InsightsFailure | null;
  /** Starts the analysis (or retries it). Only ever called by a click. */
  analyze: () => void;

  filters: InsightFilters;
  activeFilterCount: number;
  toggleRole: (role: DeveloperRole) => void;
  toggleLevel: (level: ExperienceLevel) => void;
  toggleTech: (name: string) => void;
  clearFilters: () => void;

  /** The analysis of one issue, or `undefined` when it wasn't analysed (or nothing is loaded). */
  insightFor: (issueNumber: number) => AiInsightIssue | undefined;
  /** `true` while this issue is queued for (or being sent in) a batch that is still running. */
  isWaiting: (issueNumber: number) => boolean;
  /**
   * Applies the active filters. Returns `items` itself (same reference) when no
   * filter is active, so a caller's pagination doesn't reset for no reason.
   * Issues that weren't analysed can't match a filter and are left out while
   * one is active. Call it BEFORE pagination.
   */
  filterIssues: <T extends { number: number }>(items: T[]) => T[];

  /** Analysis of the issues that were loaded after the first analysis (or that the first one didn't reach). */
  fill: InsightFillState;
  /** Asks again for the issues that still have no insight. Only ever called by a click. */
  retryFill: () => void;

  /** The viewer's onboarding answers, when they have given them. Used only for the "Matches your role" highlight — no extra AI call. */
  viewerRoles: DeveloperRole[];
  viewerLevel: ExperienceLevel | null;
  matchesViewerRole: (issue: AiInsightIssue) => boolean;
  fitsViewerLevel: (issue: AiInsightIssue) => boolean;
}

/**
 * Owns everything the Issues tab needs to show and use AI issue insights
 * (Part 6): the request state, the filter selection and the per-viewer
 * "matches you" checks. Call it once per panel, at the top (before any early
 * return), and pass the result to `IssueInsightsCard`, `IssueInsightBadges`
 * and `filterIssues`.
 *
 * `openIssueNumbers` is every OPEN issue the panel currently holds. The first
 * analysis (`analyze()`) covers the repository's newest open issues; once it
 * is on screen, any loaded open issue without an insight — the ones that
 * arrive when "Load all issues" finishes, or that the first analysis didn't
 * reach — is analysed in batches and its labels appear as each batch returns.
 * Issues that already have an insight are never sent again.
 *
 * Nothing is requested until `analyze()` is called — a signed-in visitor who
 * never presses "Analyze issues" costs no request, no GitHub call and no
 * model call, and loading more issues does not start one either. Insights
 * already fetched in this tab (module-level session cache) are shown straight
 * away when the panel is opened again.
 */
export function useIssueInsights(repo: string | null, openIssueNumbers?: readonly number[]): IssueInsightsController {
  const { status: authStatus } = useAuth();
  const [state, setState] = useState<{ status: InsightsStatus; data: AiIssueInsightsResponse | null; error: InsightsFailure | null }>(() => {
    const cached = repo ? getCachedAiInsights(repo) : null;
    return cached ? { status: "done", data: cached, error: null } : { status: "idle", data: null, error: null };
  });
  const filterApi = useInsightFilters();
  const viewer = useViewerInsightMatch();
  const { clearFilters } = filterApi;

  const controllerRef = useRef<AbortController | null>(null);
  const fillRef = useRef<AbortController | null>(null);
  /** Numbers a finished batch already asked about — if one still has no insight the AI's answer for it was unusable, so it isn't asked again on its own. */
  const attemptedRef = useRef<Set<number>>(new Set());
  const [fill, setFill] = useState<{ running: boolean; error: InsightsFailure | null }>({ running: false, error: null });
  const [retryTick, setRetryTick] = useState(0);

  const openKey = openIssueNumbers ? openIssueNumbers.join(",") : "";
  const openList = useMemo<number[]>(() => (openKey ? openKey.split(",").map(Number) : []), [openKey]);

  const stopFill = useCallback(() => {
    fillRef.current?.abort();
    fillRef.current = null;
  }, []);

  // A different repository (client-side navigation reusing this component) starts from scratch.
  useEffect(() => {
    controllerRef.current?.abort();
    stopFill();
    attemptedRef.current = new Set();
    setFill({ running: false, error: null });
    const cached = repo ? getCachedAiInsights(repo) : null;
    setState(cached ? { status: "done", data: cached, error: null } : { status: "idle", data: null, error: null });
    clearFilters();
  }, [repo, stopFill, clearFilters]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      stopFill();
    },
    [stopFill],
  );

  const analyze = useCallback(() => {
    if (!repo) return;
    if (authStatus === "unauthenticated") {
      setState({ status: "error", data: null, error: { message: "Sign in to use AI.", code: "unauthenticated" } });
      return;
    }
    controllerRef.current?.abort();
    stopFill();
    attemptedRef.current = new Set();
    setFill({ running: false, error: null });
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading", data: null, error: null });
    fetchAiIssueInsights(repo, controller.signal)
      .then((data) => setState({ status: "done", data, error: null }))
      .catch((err: unknown) => {
        if (isAbortError(err)) return;
        setState({ status: "error", data: null, error: toInsightsFailure(err) });
      });
  }, [repo, authStatus, stopFill]);

  const byNumber = useMemo(() => {
    const map = new Map<number, AiInsightIssue>();
    for (const issue of state.data?.insights.issues ?? []) map.set(issue.number, issue);
    return map;
  }, [state.data]);

  const insightFor = useCallback((issueNumber: number) => byNumber.get(issueNumber), [byNumber]);

  /** Loaded open issues without an insight. */
  const missing = useMemo(() => openList.filter((number) => !byNumber.has(number)), [openList, byNumber]);

  // Fill the gaps: once the first analysis is on screen, analyse whatever is loaded but has no insight yet.
  useEffect(() => {
    if (!repo || state.status !== "done" || fill.error || fillRef.current) return;
    const todo = missing.filter((number) => !attemptedRef.current.has(number));
    if (todo.length === 0) return;

    const controller = new AbortController();
    fillRef.current = controller;
    setFill({ running: true, error: null });

    const finish = (next: { running: boolean; error: InsightsFailure | null }) => {
      if (fillRef.current === controller) fillRef.current = null;
      setFill(next);
    };

    fillInsightGaps(repo, todo, controller.signal, (data, batch) => {
      for (const number of batch) attemptedRef.current.add(number);
      setState({ status: "done", data, error: null });
    })
      .then(() => {
        if (controller.signal.aborted) return;
        finish({ running: false, error: null });
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        finish({ running: false, error: toInsightsFailure(err) });
      });
  }, [repo, state.status, fill.running, fill.error, missing, retryTick]);

  const retryFill = useCallback(() => {
    for (const number of missing) attemptedRef.current.delete(number);
    setFill({ running: false, error: null });
    setRetryTick((tick) => tick + 1);
  }, [missing]);

  // Not reactive on its own (a ref), but it only changes together with `state`/`fill`, which re-render this hook.
  const pendingCount = state.status === "done" ? missing.filter((number) => !attemptedRef.current.has(number)).length : 0;
  // "Running" also covers the moment between new issues arriving and the effect above starting the request, so the UI never flashes a stale "not analyzed" line.
  const fillActive = state.status === "done" && !fill.error && (fill.running || pendingCount > 0);

  const openSet = useMemo(() => new Set(openList), [openList]);
  const isWaiting = useCallback(
    (issueNumber: number) => fillActive && openSet.has(issueNumber) && !byNumber.has(issueNumber) && !attemptedRef.current.has(issueNumber),
    [fillActive, openSet, byNumber],
  );

  const { filters, activeFilterCount } = filterApi;

  const filterIssues = useCallback(
    <T extends { number: number }>(items: T[]): T[] => {
      if (activeFilterCount === 0 || state.status !== "done") return items;
      return items.filter((item) => {
        const entry = byNumber.get(item.number);
        return entry ? entryMatchesFilters(entry, filters) : false;
      });
    },
    [activeFilterCount, state.status, filters, byNumber],
  );

  return {
    repo,
    authStatus,
    status: state.status,
    data: state.data,
    error: state.error,
    analyze,
    filters,
    activeFilterCount,
    toggleRole: filterApi.toggleRole,
    toggleLevel: filterApi.toggleLevel,
    toggleTech: filterApi.toggleTech,
    clearFilters: filterApi.clearFilters,
    insightFor,
    isWaiting,
    filterIssues,
    fill: {
      running: fillActive,
      error: state.status === "done" ? fill.error : null,
      pending: pendingCount,
      notAnalyzed: state.status === "done" ? missing.length : 0,
      openCount: openList.length,
    },
    retryFill,
    viewerRoles: viewer.viewerRoles,
    viewerLevel: viewer.viewerLevel,
    matchesViewerRole: viewer.matchesViewerRole,
    fitsViewerLevel: viewer.fitsViewerLevel,
  };
}