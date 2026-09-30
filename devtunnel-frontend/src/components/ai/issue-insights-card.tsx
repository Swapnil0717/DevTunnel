"use client";

import { SparkleIcon } from "@/components/layout/nav-icons";
import { AI_SECONDARY_BUTTON_CLASS, AiCardHeader, AiError, AiLoading, AiNotice, AiSignInPrompt } from "@/components/ai/ai-states";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { DEVELOPER_ROLE_LABEL, EXPERIENCE_LEVEL_LABEL, type DeveloperRole, type ExperienceLevel } from "@/lib/onboarding/types";
import type { AiInsightIssue, AiIssueInsightsResponse } from "@/lib/ai/insights-client";
import type { InsightFillState, InsightsStatus, IssueInsightsController } from "@/lib/ai/use-issue-insights";

const TAG_CLASS = "inline-block rounded-[5px] border border-border-subtle px-[7px] py-[2px] text-[10.5px] text-text-secondary";

/** Natural display order for the two enums (the API returns counts as an unordered object). */
const ROLE_ORDER: DeveloperRole[] = ["FRONTEND", "BACKEND", "FULL_STACK", "DOCUMENTATION", "TESTING", "DEVOPS"];
const LEVEL_ORDER: ExperienceLevel[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

/** Codes where asking again can't help. */
export function isPermanentFailure(code: string | undefined): boolean {
  return code === "ai_disabled" || code === "no_issues" || code === "not_found" || code === "unauthenticated";
}

// ---------------------------------------------------------------------------
// Filter groups (simple CSS count bars — no chart library)
// ---------------------------------------------------------------------------

export interface FilterRow {
  key: string;
  label: string;
  count: number;
  active: boolean;
  onToggle: () => void;
}

/**
 * One group of filter chips. Each chip is a real toggle `<button>`
 * (`aria-pressed`) showing its label, its issue count as TEXT, and a bar whose
 * width is the count relative to the group's largest — the bar is decoration
 * only (`aria-hidden`), so nothing depends on colour or length alone.
 */
export function FilterGroup({ title, rows }: { title: string; rows: FilterRow[] }) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div>
      <h5 className="m-0 mb-1.5 text-[11px] font-normal uppercase tracking-wide text-text-faint">{title}</h5>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              type="button"
              onClick={row.onToggle}
              aria-pressed={row.active}
              aria-label={`${row.label}: ${row.count} issue${row.count === 1 ? "" : "s"}`}
              className={`block w-full rounded-[7px] border px-2 py-1 text-left text-[11.5px] transition-colors ${
                row.active
                  ? "border-border bg-surface text-text"
                  : "border-border-subtle bg-transparent text-text-dim hover:border-border hover:text-text-secondary"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate">{row.label}</span>
                <span className="shrink-0 tabular-nums text-text-faint">{row.count}</span>
              </span>
              <span aria-hidden="true" className="mt-1 block h-1 overflow-hidden rounded-full bg-border-subtle">
                <span
                  className={`block h-full rounded-full ${row.active ? "bg-accent" : "bg-text-faint"}`}
                  style={{ width: `${Math.max(6, Math.round((row.count / max) * 100))}%` }}
                />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The line under the insights that follows the issues loaded AFTER the first
 * analysis (or that it didn't reach): "Analyzing N more…" while batches are
 * running, the failure with a retry when one stopped the run, and — once the
 * run is over — how many issues the AI gave no usable answer for.
 * Renders nothing when every loaded open issue has its labels.
 */
export function InsightFillStatus({ fill, onRetry }: { fill: InsightFillState; onRetry: () => void }) {
  if (fill.running) {
    const count = fill.pending > 0 ? fill.pending : fill.notAnalyzed;
    return <AiLoading className="mt-3" message={`Analyzing ${count} more issue${count === 1 ? "" : "s"}…`} />;
  }
  if (fill.error) {
    return (
      <AiError
        className="mt-3"
        message={`${fill.notAnalyzed} issue${fill.notAnalyzed === 1 ? " isn't" : "s aren't"} analyzed yet. ${fill.error.message}`}
        onRetry={isPermanentFailure(fill.error.code) ? undefined : onRetry}
      />
    );
  }
  if (fill.notAnalyzed > 0) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <p role="status" className="m-0 text-[12px] text-text-muted">
          {fill.notAnalyzed} issue{fill.notAnalyzed === 1 ? " has" : "s have"} no AI labels yet.
        </p>
        <button type="button" onClick={onRetry} className={AI_SECONDARY_BUTTON_CLASS}>
          Analyze {fill.notAnalyzed === 1 ? "it" : "them"}
        </button>
      </div>
    );
  }
  return null;
}

function InsightsBody({ controller, data }: { controller: IssueInsightsController; data: AiIssueInsightsResponse }) {
  const { insights } = data;
  const { filters } = controller;

  const roleRows: FilterRow[] = ROLE_ORDER.filter((role) => (insights.byRole[role] ?? 0) > 0)
    .sort((a, b) => (insights.byRole[b] ?? 0) - (insights.byRole[a] ?? 0))
    .map((role) => ({
      key: role,
      label: DEVELOPER_ROLE_LABEL[role],
      count: insights.byRole[role] ?? 0,
      active: filters.roles.includes(role),
      onToggle: () => controller.toggleRole(role),
    }));

  const levelRows: FilterRow[] = LEVEL_ORDER.filter((level) => (insights.byLevel[level] ?? 0) > 0).map((level) => ({
    key: level,
    label: EXPERIENCE_LEVEL_LABEL[level],
    count: insights.byLevel[level] ?? 0,
    active: filters.levels.includes(level),
    onToggle: () => controller.toggleLevel(level),
  }));

  const techRows: FilterRow[] = insights.topTechStack.map((tech) => ({
    key: tech.name,
    label: tech.name,
    count: tech.count,
    active: filters.tech.some((name) => name.toLowerCase() === tech.name.toLowerCase()),
    onToggle: () => controller.toggleTech(tech.name),
  }));

  const { bestFor } = insights;
  const hasBestFor = bestFor.roles.length + bestFor.levels.length + bestFor.techStack.length > 0;

  return (
    <div>
      {insights.overview ? <p className="m-0 text-[13px] leading-relaxed text-text">{insights.overview}</p> : null}

      {hasBestFor ? (
        <div className={`${insights.overview ? "mt-3" : ""} flex flex-wrap items-center gap-1.5`}>
          <span className="mr-1 text-[11px] uppercase tracking-wide text-text-faint">Best suited for</span>
          {bestFor.roles.map((role) => (
            <span key={`role-${role}`} className={TAG_CLASS}>
              {DEVELOPER_ROLE_LABEL[role]}
            </span>
          ))}
          {bestFor.levels.map((level) => (
            <span key={`level-${level}`} className={TAG_CLASS}>
              {EXPERIENCE_LEVEL_LABEL[level]}
            </span>
          ))}
          {bestFor.techStack.map((name) => (
            <span key={`tech-${name}`} className={TAG_CLASS}>
              {name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-1 gap-4 border-t border-border-subtle pt-3 sm:grid-cols-3">
        <FilterGroup title="Role" rows={roleRows} />
        <FilterGroup title="Level" rows={levelRows} />
        <FilterGroup title="Tech" rows={techRows} />
      </div>

      <InsightFillStatus fill={controller.fill} onRetry={controller.retryFill} />

      {controller.activeFilterCount > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p role="status" className="m-0 text-[12px] text-text-muted">
            Showing only issues that match every group you picked. Issues the AI didn&apos;t analyze are hidden while a filter is on.
          </p>
          <button type="button" onClick={controller.clearFilters} className={AI_SECONDARY_BUTTON_CLASS}>
            Clear filters
          </button>
        </div>
      ) : null}

      <p className="m-0 mt-3 text-[11px] leading-relaxed text-text-faint">
        Written by AI from issue titles, labels and short excerpts, so it can be wrong — open the issue before you start. Covers{" "}
        {data.analyzedIssueCount} open issues; an issue the AI hasn&apos;t reached shows &ldquo;Not analyzed&rdquo;. Last updated{" "}
        <time dateTime={data.generatedAt}>{formatRelativeTime(data.generatedAt)}</time>.
      </p>
    </div>
  );
}

/**
 * The "AI issue insights" card at the top of a repository's Issues tab
 * (Part 6). Pair it with `useIssueInsights` (called by the panel) and
 * `IssueInsightBadges` on each row.
 *
 * States (Part 1 rule 10):
 *  - no GitHub repository ... renders nothing (there is nothing to analyse);
 *  - signed out ............. a sign-in prompt (the endpoint is signed-in only) — no request is made;
 *  - idle ................... one button, "Analyze issues"; nothing has been requested yet;
 *  - loading ................ `role="status"`: spinner, "Analyzing open issues…" and a skeleton;
 *  - done ................... overview, "Best suited for", the role / level / tech filter groups, and a reminder that it can be wrong;
 *  - AI switched off ........ a one-line notice (`ai_disabled`), nothing to click;
 *  - nothing to analyse ..... a one-line notice (`no_issues`, `not_found`);
 *  - other errors ........... `role="alert"` with "Try again".
 *
 * Everything the model wrote is rendered as React text — never as HTML or
 * markdown.
 */
export function IssueInsightsCard({ controller }: { controller: IssueInsightsController }) {
  const { repo, status, data, error, authStatus } = controller;
  if (!repo) return null;

  let body: JSX.Element;
  if (authStatus === "unauthenticated" || (status === "error" && error?.code === "unauthenticated")) {
    body = <AiSignInPrompt message="See which roles, levels and technologies this repository&apos;s open issues need." />;
  } else if (status === "loading") {
    body = <AiLoading message="Analyzing open issues… this can take a few seconds the first time." skeletonLines={4} />;
  } else if (status === "error" && error?.code === "ai_disabled") {
    body = <AiNotice>AI issue insights are turned off right now.</AiNotice>;
  } else if (status === "error" && (error?.code === "no_issues" || error?.code === "not_found")) {
    body = (
      <AiNotice>
        {error.code === "no_issues" ? "This repository has no open issues to analyze." : "DevTunnel couldn't read this repository's issues."}
      </AiNotice>
    );
  } else if (status === "error") {
    body = (
      <AiError
        message={error?.message ?? "The AI analysis couldn't be loaded."}
        onRetry={isPermanentFailure(error?.code) ? undefined : controller.analyze}
      />
    );
  } else if (status === "done" && data) {
    body = <InsightsBody controller={controller} data={data} />;
  } else {
    // idle
    body = (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 text-[12.5px] text-text-muted">
          Let AI sort this repository&apos;s open issues by role, level and technology so you can filter to what suits you.
        </p>
        <button type="button" onClick={controller.analyze} disabled={authStatus === "loading"} className={AI_SECONDARY_BUTTON_CLASS}>
          <SparkleIcon className="h-3.5 w-3.5" />
          Analyze issues
        </button>
      </div>
    );
  }

  return (
    <section aria-label="AI issue insights" className="mb-4 rounded-[8px] border border-border-subtle bg-surface-raised p-4">
      <AiCardHeader title="Issue insights" level="h4" done={status === "done"} />
      {body}
    </section>
  );
}

/** What a row's AI labels need. `IssueInsightsController` satisfies it; the All Issues page hands each row one per repository. */
export interface InsightBadgeSource {
  status: InsightsStatus;
  insightFor: (issueNumber: number) => AiInsightIssue | undefined;
  isWaiting: (issueNumber: number) => boolean;
  matchesViewerRole: (issue: AiInsightIssue) => boolean;
  fitsViewerLevel: (issue: AiInsightIssue) => boolean;
}

/**
 * The AI labels for ONE issue row: role, level, up to 3 technologies, the
 * one-line description, and — for a signed-in viewer who has answered
 * onboarding — "Matches your role" / "Fits your level" (worked out in the
 * browser from `developerRoles` / `experienceLevel`; no extra AI call).
 *
 * Renders nothing until the insights are loaded. An issue that is still
 * waiting for its batch says "Analyzing…"; one the analysis didn't reach (or
 * whose answer was dropped as invalid) says "Not analyzed" instead of showing
 * a guess. Every label is text, and the row's
 * AI origin is stated ("AI estimate") — Part 1 rule 9.
 *
 * Place it BESIDE the row's link, not inside it (nothing here is a link, but
 * keeping the row's `<a>` as one plain target keeps it keyboard-friendly).
 */
export function IssueInsightBadges({ controller, issueNumber }: { controller: InsightBadgeSource; issueNumber: number }) {
  if (controller.status !== "done") return null;
  const entry = controller.insightFor(issueNumber);

  if (!entry) {
    return controller.isWaiting(issueNumber) ? (
      <p role="status" className="m-0 inline-flex items-center gap-1 text-[10.5px] text-text-faint">
        <SparkleIcon className="h-3 w-3" />
        Analyzing…
      </p>
    ) : (
      <p className="m-0 text-[10.5px] text-text-faint">Not analyzed</p>
    );
  }

  const matchesRole = controller.matchesViewerRole(entry);
  const fitsLevel = controller.fitsViewerLevel(entry);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10.5px] text-text-faint">
          <SparkleIcon className="h-3 w-3" />
          AI estimate
        </span>
        <span className={TAG_CLASS}>{DEVELOPER_ROLE_LABEL[entry.role]}</span>
        <span className={TAG_CLASS}>{EXPERIENCE_LEVEL_LABEL[entry.level]} level</span>
        {entry.techStack.slice(0, 3).map((name) => (
          <span key={name} className={TAG_CLASS}>
            {name}
          </span>
        ))}
        {matchesRole ? (
          <span className="inline-block rounded-[5px] border border-accent/50 px-[7px] py-[2px] text-[10.5px] font-medium text-accent">Matches your role</span>
        ) : null}
        {fitsLevel ? (
          <span className="inline-block rounded-[5px] border border-border px-[7px] py-[2px] text-[10.5px] text-text-secondary">Fits your level</span>
        ) : null}
      </div>
      {entry.oneLine ? <p className="m-0 text-[11.5px] leading-snug text-text-dim">{entry.oneLine}</p> : null}
    </div>
  );
}
