"use client";

import { SparkleIcon } from "@/components/layout/nav-icons";
import { FilterGroup, InsightFillStatus, type FilterRow } from "@/components/ai/issue-insights-card";
import { AI_SECONDARY_BUTTON_CLASS, AiCardHeader, AiLoading, AiSignInPrompt } from "@/components/ai/ai-states";
import { DEVELOPER_ROLE_LABEL, EXPERIENCE_LEVEL_LABEL, type DeveloperRole, type ExperienceLevel } from "@/lib/onboarding/types";
import type { IssuesPageInsights } from "@/lib/ai/use-issues-page-insights";

/** Natural display order for the two enums (the summary keeps counts as unordered objects). */
const ROLE_ORDER: DeveloperRole[] = ["FRONTEND", "BACKEND", "FULL_STACK", "DOCUMENTATION", "TESTING", "DEVOPS"];
const LEVEL_ORDER: ExperienceLevel[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

/**
 * "AI issue insights" for the All Issues page (`/issues`), above the filters.
 * Pair it with `useIssuesPageInsights` (called by `IssuesExplorer`) and the
 * per-row labels in `IssuesTable`.
 *
 * States (Part 1 rule 10):
 *  - signed out ...... a sign-in prompt — no request is made;
 *  - idle ............ one button, "Analyze this page"; nothing has been requested;
 *  - analyzing ....... `role="status"` while the first batch is on its way;
 *  - done ............ role / level / tech chips counting the analyzed issues of the
 *                      current list, what is still being analyzed (or failed, with a
 *                      retry), and — until it is done — "Analyze all" for the rest;
 *  - failure ......... `role="alert"` with "Try again"; labels that already arrived stay.
 *
 * The AI only looks at the issues on the page being shown (far fewer AI calls
 * than the whole list); "Analyze all" is a separate, explicit click. Everything
 * the model wrote is rendered as React text — never as HTML or markdown.
 */
export function IssuesInsightsCard({ insights }: { insights: IssuesPageInsights }) {
  const { started, authStatus, summary, fill, scope } = insights;

  let body: JSX.Element;
  if (authStatus === "unauthenticated") {
    body = <AiSignInPrompt message="See which roles, levels and technologies these issues need." />;
  } else if (!started) {
    body = (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-[12.5px] text-text-muted">
          Let AI label the issues on this page by role, level and technology so you can filter to what suits you. It works one page at a time to keep AI usage low.
        </p>
        <button type="button" onClick={insights.analyzePage} disabled={authStatus === "loading"} className={AI_SECONDARY_BUTTON_CLASS}>
          <SparkleIcon className="h-3.5 w-3.5" />
          Analyze this page
        </button>
      </div>
    );
  } else if (summary.analyzed === 0 && fill.running) {
    body = <AiLoading message="Analyzing the issues… this can take a few seconds the first time." skeletonLines={3} />;
  } else {
    const { filters } = insights;

    const roleRows: FilterRow[] = ROLE_ORDER.filter((role) => (summary.byRole[role] ?? 0) > 0)
      .sort((a, b) => (summary.byRole[b] ?? 0) - (summary.byRole[a] ?? 0))
      .map((role) => ({
        key: role,
        label: DEVELOPER_ROLE_LABEL[role],
        count: summary.byRole[role] ?? 0,
        active: filters.roles.includes(role),
        onToggle: () => insights.toggleRole(role),
      }));

    const levelRows: FilterRow[] = LEVEL_ORDER.filter((level) => (summary.byLevel[level] ?? 0) > 0).map((level) => ({
      key: level,
      label: EXPERIENCE_LEVEL_LABEL[level],
      count: summary.byLevel[level] ?? 0,
      active: filters.levels.includes(level),
      onToggle: () => insights.toggleLevel(level),
    }));

    const techRows: FilterRow[] = summary.topTechStack.map((tech) => ({
      key: tech.name,
      label: tech.name,
      count: tech.count,
      active: filters.tech.some((name) => name.toLowerCase() === tech.name.toLowerCase()),
      onToggle: () => insights.toggleTech(tech.name),
    }));

    const remaining = summary.total - summary.analyzed;
    const canAnalyzeAll = scope === "page" && remaining > 0 && !fill.running && !fill.error;

    body = (
      <div>
        {roleRows.length + levelRows.length + techRows.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FilterGroup title="Role" rows={roleRows} />
            <FilterGroup title="Level" rows={levelRows} />
            <FilterGroup title="Tech" rows={techRows} />
          </div>
        ) : null}

        <InsightFillStatus
          fill={{ running: fill.running, error: fill.error, pending: fill.pending, notAnalyzed: fill.notAnalyzed, openCount: fill.targeted }}
          onRetry={insights.retry}
        />

        {canAnalyzeAll ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="m-0 text-[12px] text-text-muted">
              {remaining} more open issue{remaining === 1 ? "" : "s"} in this list {remaining === 1 ? "isn't" : "aren't"} analyzed. They are analyzed as you turn the pages.
            </p>
            <button type="button" onClick={insights.analyzeAll} className={AI_SECONDARY_BUTTON_CLASS}>
              <SparkleIcon className="h-3.5 w-3.5" />
              Analyze all {remaining}
            </button>
          </div>
        ) : null}

        {insights.activeFilterCount > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <p role="status" className="m-0 text-[12px] text-text-muted">
              Showing only analyzed issues that match every group you picked. Issues the AI hasn&apos;t analyzed yet are hidden while a filter is on.
            </p>
            <button type="button" onClick={insights.clearFilters} className={AI_SECONDARY_BUTTON_CLASS}>
              Clear filters
            </button>
          </div>
        ) : null}

        <p className="m-0 mt-3 text-[11px] leading-relaxed text-text-faint">
          Written by AI from issue titles, labels and short excerpts, so it can be wrong — open the issue before you start. The counts cover the {summary.analyzed} of{" "}
          {summary.total} open issues in this list that have been analyzed; an issue the AI hasn&apos;t reached shows &ldquo;Not analyzed&rdquo;.
        </p>
      </div>
    );
  }

  return (
    <section aria-label="AI issue insights" className="mb-4 rounded-[8px] border border-border-subtle bg-surface-raised p-4">
      <AiCardHeader title="Issue insights" level="h2" done={started && summary.analyzed > 0} />
      {body}
    </section>
  );
}
