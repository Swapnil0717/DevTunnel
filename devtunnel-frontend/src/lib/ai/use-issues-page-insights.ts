"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/use-auth";
import type { DeveloperRole, ExperienceLevel } from "@/lib/onboarding/types";
import {
  fillInsightGaps,
  getCachedAiInsights,
  isAbortError,
  toInsightsFailure,
  type AiInsightIssue,
  type AiIssueInsightsResponse,
  type InsightsFailure,
} from "@/lib/ai/insights-client";
import { entryMatchesFilters, useInsightFilters, useViewerInsightMatch, type InsightFilters } from "@/lib/ai/use-issue-insights";
import type { Issue } from "@/lib/issues/types";

/** Same rule the backend and the Explain button apply before a repository name goes anywhere. */
const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

/** Which issues the AI looks at: only the ones on the page being shown, or everything in the current list. */
export type IssuesInsightsScope = "page" | "all";

export interface IssuesPageSummary {
  /** Issues in the current list that have an AI insight. */
  analyzed: number;
  /** Open issues in the current list. */
  total: number;
  byRole: Partial<Record<DeveloperRole, number>>;
  byLevel: Partial<Record<ExperienceLevel, number>>;
  topTechStack: { name: string; count: number }[];
}

export interface IssuesPageFill {
  /** Batches are being requested right now (or are about to be). */
  running: boolean;
  error: InsightsFailure | null;
  /** Targeted issues that haven't been asked about yet. */
  pending: number;
  /** Targeted issues that still have no insight. */
  notAnalyzed: number;
  /** Open issues the AI is currently aimed at (this page, or the whole list). */
  targeted: number;
}

/** What `IssueInsightBadges` needs for ONE repository's rows — same shape as the repository pages' controller. */
export interface IssuesRowInsights {
  status: "idle" | "done";
  insightFor: (issueNumber: number) => AiInsightIssue | undefined;
  isWaiting: (issueNumber: number) => boolean;
  matchesViewerRole: (issue: AiInsightIssue) => boolean;
  fitsViewerLevel: (issue: AiInsightIssue) => boolean;
}

export interface IssuesPageInsights {
  authStatus: "loading" | "authenticated" | "unauthenticated";
  /** The visitor has pressed "Analyze this page" (nothing AI is requested before that). */
  started: boolean;
  scope: IssuesInsightsScope;
  /** Starts the analysis for the issues on the current page. Only ever called by a click. */
  analyzePage: () => void;
  /** Widens the analysis to every open issue in the current list. Only ever called by a click. */
  analyzeAll: () => void;
  /** Tells the hook which issues are on the page and in the whole (search/state/… filtered) list. Safe to call on every change. */
  setTargets: (pageIssues: Issue[], allIssues: Issue[]) => void;

  filters: InsightFilters;
  activeFilterCount: number;
  toggleRole: (role: DeveloperRole) => void;
  toggleLevel: (level: ExperienceLevel) => void;
  toggleTech: (name: string) => void;
  clearFilters: () => void;
  /** Applies the role / level / tech chips. Returns `items` itself when none is active. Call it BEFORE pagination. */
  filterIssues: (items: Issue[]) => Issue[];

  summary: IssuesPageSummary;
  fill: IssuesPageFill;
  /** Asks again for the targeted issues that still have no insight. Only ever called by a click. */
  retry: () => void;
  /** The per-row label source for one repository (`owner/repo`). */
  sourceFor: (repositoryFullName: string) => IssuesRowInsights;
}

interface Targets {
  page: Issue[];
  all: Issue[];
}

const repoKeyOf = (repositoryFullName: string): string => repositoryFullName.toLowerCase();
const issueKeyOf = (repositoryFullName: string, number: number): string => `${repoKeyOf(repositoryFullName)}#${number}`;

function isAnalyzable(issue: Issue): boolean {
  return issue.state === "OPEN" && REPO_NAME_PATTERN.test(issue.project.repositoryFullName);
}

/**
 * AI issue insights for the All Issues page (`/issues`), which — unlike a
 * repository's own Issues tab — mixes issues from many repositories.
 *
 * It reuses the same backend request and the same "only the issues that have
 * no insight yet" rule as the repository pages (`fillInsightGaps`), once per
 * repository:
 *  - nothing is requested until "Analyze this page" is pressed;
 *  - then the open issues on the page being shown are analysed — page by page
 *    as the visitor browses, not the whole list (that costs far fewer AI
 *    calls). "Analyze all" is an explicit, separate click;
 *  - issues that already have an insight (from the database, or fetched
 *    earlier in this tab) are never sent again, and issues that arrive when
 *    "Load all issues" finishes are analysed the same way as soon as they are
 *    in scope.
 *
 * The chips can only match issues that have an insight, so while one is on
 * the list shows only the analysed issues that match it.
 */
export function useIssuesPageInsights(): IssuesPageInsights {
  const { status: authStatus } = useAuth();
  const filterApi = useInsightFilters();
  const viewer = useViewerInsightMatch();

  const [started, setStarted] = useState(false);
  const [scope, setScope] = useState<IssuesInsightsScope>("page");
  const [responses, setResponses] = useState<Record<string, AiIssueInsightsResponse>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<InsightsFailure | null>(null);
  const [tick, setTick] = useState(0);

  const targetsRef = useRef<Targets>({ page: [], all: [] });
  const targetsKeyRef = useRef("");
  const responsesRef = useRef(responses);
  responsesRef.current = responses;
  const runRef = useRef<AbortController | null>(null);
  /** `repo#number` of issues a finished batch already asked about — if one still has no insight the AI's answer for it was unusable, so it isn't asked again on its own. */
  const attemptedRef = useRef<Set<string>>(new Set());

  useEffect(
    () => () => {
      runRef.current?.abort();
      runRef.current = null;
    },
    [],
  );

  const setTargets = useCallback((pageIssues: Issue[], allIssues: Issue[]) => {
    // A cheap signature of both lists, so calling this on every render of the explorer doesn't loop.
    let allHash = 0;
    for (const issue of allIssues) allHash = (Math.imul(allHash, 31) + issue.number + issue.project.repositoryFullName.length) | 0;
    const pageKey = pageIssues.map((issue) => issueKeyOf(issue.project.repositoryFullName, issue.number)).join(",");
    const key = `${pageKey}|${allIssues.length}|${allHash}`;
    if (key === targetsKeyRef.current) return;
    targetsKeyRef.current = key;
    targetsRef.current = { page: pageIssues, all: allIssues };
    setTick((value) => value + 1);
  }, []);

  /** The open issues the AI is currently aimed at. */
  const targeted = useMemo(
    () => (scope === "all" ? targetsRef.current.all : targetsRef.current.page).filter(isAnalyzable),
    // `tick` is how a change to the targets ref reaches this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, tick],
  );

  /** `repo#number` -> its insight, across every repository fetched so far. */
  const entryMap = useMemo(() => {
    const map = new Map<string, AiInsightIssue>();
    for (const [repoKey, response] of Object.entries(responses)) {
      for (const issue of response.insights.issues) map.set(`${repoKey}#${issue.number}`, issue);
    }
    return map;
  }, [responses]);

  const start = useCallback(() => {
    if (authStatus === "unauthenticated") {
      setError({ message: "Sign in to use AI.", code: "unauthenticated" });
      return;
    }
    // Insights already fetched in this tab (e.g. on a repository page) are used straight away.
    const seeded: Record<string, AiIssueInsightsResponse> = {};
    for (const issue of targetsRef.current.all) {
      const repo = issue.project.repositoryFullName;
      if (!REPO_NAME_PATTERN.test(repo) || seeded[repoKeyOf(repo)]) continue;
      const cached = getCachedAiInsights(repo);
      if (cached) seeded[repoKeyOf(repo)] = cached;
    }
    setResponses((previous) => ({ ...seeded, ...previous }));
    setError(null);
    setStarted(true);
    setTick((value) => value + 1);
  }, [authStatus]);

  const analyzePage = start;

  const analyzeAll = useCallback(() => {
    setScope("all");
    if (!started) start();
    else setTick((value) => value + 1);
  }, [started, start]);

  // Fill the gaps for whatever is in scope: one repository after the next, one batch after the next.
  useEffect(() => {
    if (!started || error || runRef.current) return;

    const groups = new Map<string, { repo: string; numbers: number[] }>();
    for (const issue of targeted) {
      const repo = issue.project.repositoryFullName;
      const issueKey = issueKeyOf(repo, issue.number);
      if (attemptedRef.current.has(issueKey)) continue;
      const stored = responsesRef.current[repoKeyOf(repo)];
      if (stored?.insights.issues.some((entry) => entry.number === issue.number)) continue;
      const group = groups.get(repoKeyOf(repo)) ?? { repo, numbers: [] };
      group.numbers.push(issue.number);
      groups.set(repoKeyOf(repo), group);
    }
    if (groups.size === 0) return;

    const controller = new AbortController();
    runRef.current = controller;
    setRunning(true);

    const finish = (failure: InsightsFailure | null) => {
      if (runRef.current === controller) runRef.current = null;
      setRunning(false);
      setError(failure);
    };

    void (async () => {
      for (const group of groups.values()) {
        const repoKey = repoKeyOf(group.repo);
        try {
          await fillInsightGaps(group.repo, group.numbers, controller.signal, (data, batch) => {
            for (const number of batch) attemptedRef.current.add(`${repoKey}#${number}`);
            setResponses((previous) => ({ ...previous, [repoKey]: data }));
          });
        } catch (err) {
          if (isAbortError(err) || controller.signal.aborted) return;
          const failure = toInsightsFailure(err);
          if (failure.code === "not_found" || failure.code === "no_issues") {
            // This repository can't be analysed (private, gone, nothing open) — skip it, keep going.
            for (const number of group.numbers) attemptedRef.current.add(`${repoKey}#${number}`);
            continue;
          }
          finish(failure);
          return;
        }
        for (const number of group.numbers) attemptedRef.current.add(`${repoKey}#${number}`);
      }
      if (!controller.signal.aborted) finish(null);
    })();
  }, [started, error, running, targeted, tick]);

  const retry = useCallback(() => {
    for (const issue of targeted) attemptedRef.current.delete(issueKeyOf(issue.project.repositoryFullName, issue.number));
    setError(null);
    setTick((value) => value + 1);
  }, [targeted]);

  const { filters, activeFilterCount } = filterApi;

  const filterIssues = useCallback(
    (items: Issue[]): Issue[] => {
      if (activeFilterCount === 0 || !started) return items;
      return items.filter((issue) => {
        const entry = entryMap.get(issueKeyOf(issue.project.repositoryFullName, issue.number));
        return entry ? entryMatchesFilters(entry, filters) : false;
      });
    },
    [activeFilterCount, started, filters, entryMap],
  );

  // Counts over the open issues in the current list that have an insight — so the chips add up to the rows they filter.
  const summary = useMemo<IssuesPageSummary>(() => {
    const byRole: Partial<Record<DeveloperRole, number>> = {};
    const byLevel: Partial<Record<ExperienceLevel, number>> = {};
    const tech = new Map<string, { name: string; count: number }>();
    let analyzed = 0;
    let total = 0;
    for (const issue of targetsRef.current.all) {
      if (!isAnalyzable(issue)) continue;
      total += 1;
      const entry = entryMap.get(issueKeyOf(issue.project.repositoryFullName, issue.number));
      if (!entry) continue;
      analyzed += 1;
      byRole[entry.role] = (byRole[entry.role] ?? 0) + 1;
      byLevel[entry.level] = (byLevel[entry.level] ?? 0) + 1;
      for (const name of entry.techStack) {
        const key = name.toLowerCase();
        const existing = tech.get(key);
        if (existing) existing.count += 1;
        else tech.set(key, { name, count: 1 });
      }
    }
    const topTechStack = [...tech.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 8);
    return { analyzed, total, byRole, byLevel, topTechStack };
    // `tick` is how a change to the targets ref reaches this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryMap, tick]);

  const { pending, notAnalyzed } = (() => {
    let pendingCount = 0;
    let missingCount = 0;
    for (const issue of targeted) {
      const issueKey = issueKeyOf(issue.project.repositoryFullName, issue.number);
      if (entryMap.has(issueKey)) continue;
      missingCount += 1;
      if (!attemptedRef.current.has(issueKey)) pendingCount += 1;
    }
    return { pending: pendingCount, notAnalyzed: missingCount };
  })();

  // "Running" also covers the moment between new issues coming into scope and the effect above starting the request.
  const fillActive = started && !error && (running || pending > 0);

  const sourceFor = useCallback(
    (repositoryFullName: string): IssuesRowInsights => ({
      status: started ? "done" : "idle",
      insightFor: (issueNumber) => entryMap.get(issueKeyOf(repositoryFullName, issueNumber)),
      isWaiting: (issueNumber) => {
        if (!fillActive) return false;
        const issueKey = issueKeyOf(repositoryFullName, issueNumber);
        return !entryMap.has(issueKey) && !attemptedRef.current.has(issueKey) && targeted.some((issue) => issueKeyOf(issue.project.repositoryFullName, issue.number) === issueKey);
      },
      matchesViewerRole: viewer.matchesViewerRole,
      fitsViewerLevel: viewer.fitsViewerLevel,
    }),
    [started, entryMap, fillActive, targeted, viewer.matchesViewerRole, viewer.fitsViewerLevel],
  );

  return {
    authStatus,
    started,
    scope,
    analyzePage,
    analyzeAll,
    setTargets,
    filters,
    activeFilterCount,
    toggleRole: filterApi.toggleRole,
    toggleLevel: filterApi.toggleLevel,
    toggleTech: filterApi.toggleTech,
    clearFilters: filterApi.clearFilters,
    filterIssues,
    summary,
    fill: { running: fillActive, error: started ? error : null, pending, notAnalyzed, targeted: targeted.length },
    retry,
    sourceFor,
  };
}