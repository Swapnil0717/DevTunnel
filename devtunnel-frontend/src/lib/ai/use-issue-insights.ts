"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import type { DeveloperRole, ExperienceLevel } from "@/lib/onboarding/types";
import {
  AiInsightsError,
  fetchAiIssueInsights,
  getCachedAiInsights,
  type AiInsightIssue,
  type AiIssueInsightsResponse,
} from "@/lib/ai/insights-client";

export type InsightsStatus = "idle" | "loading" | "done" | "error";

export interface InsightsFailure {
  message: string;
  code?: string;
}

export interface InsightFilters {
  roles: DeveloperRole[];
  levels: ExperienceLevel[];
  /** Canonical technology names, compared case-insensitively. */
  tech: string[];
}

const NO_FILTERS: InsightFilters = { roles: [], levels: [], tech: [] };

const LEVEL_RANK: Record<ExperienceLevel, number> = { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 2 };

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
  /**
   * Applies the active filters. Returns `items` itself (same reference) when no
   * filter is active, so a caller's pagination doesn't reset for no reason.
   * Issues that weren't analysed can't match a filter and are left out while
   * one is active. Call it BEFORE pagination.
   */
  filterIssues: <T extends { number: number }>(items: T[]) => T[];

  /** The viewer's onboarding answers, when they have given them. Used only for the "Matches your role" highlight — no extra AI call. */
  viewerRoles: DeveloperRole[];
  viewerLevel: ExperienceLevel | null;
  matchesViewerRole: (issue: AiInsightIssue) => boolean;
  fitsViewerLevel: (issue: AiInsightIssue) => boolean;
}

function toggled<T>(list: T[], value: T, same: (a: T, b: T) => boolean = (a, b) => a === b): T[] {
  return list.some((item) => same(item, value)) ? list.filter((item) => !same(item, value)) : [...list, value];
}

/**
 * Owns everything the Issues tab needs to show and use AI issue insights
 * (Part 6): the request state, the filter selection and the per-viewer
 * "matches you" checks. Call it once per panel, at the top (before any early
 * return), and pass the result to `IssueInsightsCard`, `IssueInsightBadges`
 * and `filterIssues`.
 *
 * Nothing is requested until `analyze()` is called — a signed-in visitor who
 * never presses "Analyze issues" costs no request, no GitHub call and no
 * model call. Insights already fetched in this tab (module-level session
 * cache) are shown straight away when the panel is opened again.
 */
export function useIssueInsights(repo: string | null): IssueInsightsController {
  const { user, status: authStatus } = useAuth();
  const [state, setState] = useState<{ status: InsightsStatus; data: AiIssueInsightsResponse | null; error: InsightsFailure | null }>(() => {
    const cached = repo ? getCachedAiInsights(repo) : null;
    return cached ? { status: "done", data: cached, error: null } : { status: "idle", data: null, error: null };
  });
  const [filters, setFilters] = useState<InsightFilters>(NO_FILTERS);
  const controllerRef = useRef<AbortController | null>(null);

  // A different repository (client-side navigation reusing this component) starts from scratch.
  useEffect(() => {
    controllerRef.current?.abort();
    const cached = repo ? getCachedAiInsights(repo) : null;
    setState(cached ? { status: "done", data: cached, error: null } : { status: "idle", data: null, error: null });
    setFilters(NO_FILTERS);
  }, [repo]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const analyze = useCallback(() => {
    if (!repo) return;
    if (authStatus === "unauthenticated") {
      setState({ status: "error", data: null, error: { message: "Sign in to use AI.", code: "unauthenticated" } });
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: "loading", data: null, error: null });
    fetchAiIssueInsights(repo, controller.signal)
      .then((data) => setState({ status: "done", data, error: null }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const failure: InsightsFailure =
          err instanceof AiInsightsError
            ? err.status === 401 || err.code === "unauthenticated"
              ? { message: "Sign in to use AI.", code: "unauthenticated" }
              : { message: err.message, code: err.code }
            : { message: "The AI analysis couldn't be loaded. Try again." };
        setState({ status: "error", data: null, error: failure });
      });
  }, [repo, authStatus]);

  const byNumber = useMemo(() => {
    const map = new Map<number, AiInsightIssue>();
    for (const issue of state.data?.insights.issues ?? []) map.set(issue.number, issue);
    return map;
  }, [state.data]);

  const insightFor = useCallback((issueNumber: number) => byNumber.get(issueNumber), [byNumber]);

  const activeFilterCount = filters.roles.length + filters.levels.length + filters.tech.length;

  const filterIssues = useCallback(
    <T extends { number: number }>(items: T[]): T[] => {
      if (activeFilterCount === 0 || state.status !== "done") return items;
      const techWanted = filters.tech.map((name) => name.toLowerCase());
      return items.filter((item) => {
        const entry = byNumber.get(item.number);
        if (!entry) return false;
        if (filters.roles.length > 0 && !filters.roles.includes(entry.role)) return false;
        if (filters.levels.length > 0 && !filters.levels.includes(entry.level)) return false;
        if (techWanted.length > 0 && !entry.techStack.some((name) => techWanted.includes(name.toLowerCase()))) return false;
        return true;
      });
    },
    [activeFilterCount, state.status, filters, byNumber],
  );

  const viewerRoles = useMemo<DeveloperRole[]>(() => user?.developerRoles ?? [], [user]);
  const viewerLevel: ExperienceLevel | null = user?.experienceLevel ?? null;

  const matchesViewerRole = useCallback(
    (issue: AiInsightIssue): boolean => {
      if (viewerRoles.length === 0) return false;
      if (viewerRoles.includes(issue.role)) return true;
      // Same convention as the Tasks explorer: a full-stack developer isn't narrowed to one side.
      return viewerRoles.includes("FULL_STACK") && (issue.role === "FRONTEND" || issue.role === "BACKEND");
    },
    [viewerRoles],
  );

  const fitsViewerLevel = useCallback(
    (issue: AiInsightIssue): boolean => viewerLevel !== null && LEVEL_RANK[issue.level] <= LEVEL_RANK[viewerLevel],
    [viewerLevel],
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
    toggleRole: (role) => setFilters((f) => ({ ...f, roles: toggled(f.roles, role) })),
    toggleLevel: (level) => setFilters((f) => ({ ...f, levels: toggled(f.levels, level) })),
    toggleTech: (name) => setFilters((f) => ({ ...f, tech: toggled(f.tech, name, (a, b) => a.toLowerCase() === b.toLowerCase()) })),
    clearFilters: () => setFilters(NO_FILTERS),
    insightFor,
    filterIssues,
    viewerRoles,
    viewerLevel,
    matchesViewerRole,
    fitsViewerLevel,
  };
}
