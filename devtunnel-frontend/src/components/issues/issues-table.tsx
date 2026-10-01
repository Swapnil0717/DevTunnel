"use client";

import { useState } from "react";
import { AiExplainToggle, AiExplanationPanel } from "@/components/ai/ai-explain-button";
import { IssueInsightBadges } from "@/components/ai/issue-insights-card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { RepoLogo } from "@/components/admin/repo-logo";
import { IssueIcon } from "@/components/layout/nav-icons";
import type { IssuesPageInsights } from "@/lib/ai/use-issues-page-insights";
import type { Issue } from "@/lib/issues/types";

/** How many labels to show inline before collapsing into "+N". */
const MAX_VISIBLE_LABELS = 4;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * All Issues list (`/issues`) — the contributor-facing counterpart to
 * `AdminNewIssuesTable`. Each issue is one card instead of a row in a
 * 7-column table (same redesign as `TasksTable`), so a long title wraps
 * across the card's full width and nothing scrolls sideways at any screen
 * size.
 *
 * A card shows the same facts the table did, regrouped:
 *  - issue title + Open/Closed state (top row);
 *  - issue number, project, repository and GitHub author (second line);
 *  - labels as chips, and — once the visitor has asked for the AI analysis —
 *    the AI labels (role, level, technologies) from `IssueInsightBadges`;
 *  - created / updated dates, the AI "Explain" toggle and "View on GitHub"
 *    (footer).
 * Task creation/curation stays an Admin action; the only action a
 * contributor gets here is opening the issue on GitHub.
 *
 * Open issues also get an "Explain" toggle (Part 5). Opening it shows the AI
 * explanation inside the card (`AiExplanationPanel`, which only asks the
 * backend once it is on screen). That per-card open state is why this file is
 * a client component. The toggle is a `<button>`, so `ClickableCard` leaves
 * its click alone instead of opening the GitHub issue, and the expanded
 * panel is excluded from the card's click-to-open behavior too.
 *
 * Dates are shown as readable text plus a machine-readable `<time suppressHydrationWarning
 * datetime>` (rule 46), and the state is always the word "Open"/"Closed" —
 * never color alone (rule 43). The whole card also opens the GitHub issue in
 * a new tab on click (`ClickableCard`), same destination as the title link
 * and "View on GitHub".
 */
export function IssuesTable({ issues, insights }: { issues: Issue[]; insights?: IssuesPageInsights }) {
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(new Set());

  function toggle(key: string) {
    setOpenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Issues">
      {issues.map((issue) => {
        const visibleLabels = issue.labels.slice(0, MAX_VISIBLE_LABELS);
        const hiddenLabelCount = issue.labels.length - visibleLabels.length;
        const rowKey = `${issue.project.slug}-${issue.number}`;
        const panelId = `ai-explain-${rowKey}`;
        const canExplain = issue.state === "OPEN" && /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(issue.project.repositoryFullName);
        const isOpen = canExplain && openKeys.has(rowKey);
        const isOpenIssue = issue.state === "OPEN";

        return (
          <li key={rowKey}>
            <ClickableCard
              externalHref={issue.url}
              className="overflow-hidden rounded-[10px] border border-border bg-surface transition-colors hover:border-border-subtle hover:bg-surface-raised"
            >
              <div className="px-4 py-3.5 sm:px-5">
                {/* Title + state */}
                <div className="flex items-start justify-between gap-3">
                  <h3 className="m-0 min-w-0 text-[14.5px] font-medium leading-snug text-text">
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-start gap-1.5 hover:text-accent"
                    >
                      <IssueIcon className="mt-[3px] h-3.5 w-3.5 shrink-0" />
                      <span>{issue.title}</span>
                    </a>
                  </h3>
                  <span className="inline-flex shrink-0 items-center gap-1.5 pt-0.5 text-[12.5px] text-text-secondary">
                    <span
                      aria-hidden="true"
                      className="inline-block h-[6px] w-[6px] rounded-full"
                      style={{ backgroundColor: isOpenIssue ? "#1D9E75" : "#6B6B6B" }}
                    />
                    {isOpenIssue ? "Open" : "Closed"}
                  </span>
                </div>

                {/* Number, project, repository, author */}
                <p className="m-0 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-muted">
                  <span className="font-mono text-[11.5px] text-text-secondary">#{issue.number}</span>
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <RepoLogo repositoryFullName={issue.project.repositoryFullName} size={14} />
                    <span className="truncate">{issue.project.name}</span>
                    <span className="truncate font-mono text-[11px] text-text-faint">{issue.project.repositoryFullName}</span>
                  </span>
                  <a
                    href={issue.author.profileUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="hover:text-accent"
                  >
                    @{issue.author.username}
                  </a>
                </p>

                {/* Labels + AI insight labels */}
                {issue.labels.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {visibleLabels.map((label) => (
                      <span
                        key={label}
                        className="inline-flex items-center rounded-md border border-border bg-surface-raised px-2 py-0.5 text-[11.5px] text-text-secondary"
                      >
                        {label}
                      </span>
                    ))}
                    {hiddenLabelCount > 0 ? <span className="text-[11px] text-text-faint">+{hiddenLabelCount}</span> : null}
                  </div>
                ) : null}
                {insights && canExplain ? (
                  <div className="mt-2.5">
                    <IssueInsightBadges controller={insights.sourceFor(issue.project.repositoryFullName)} issueNumber={issue.number} />
                  </div>
                ) : null}

                {/* Footer — dates, AI "Explain", View on GitHub. Task creation/curation stays an Admin action. */}
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border-subtle pt-3">
                  <p className="m-0 text-[12px] text-text-muted">
                    Created <time suppressHydrationWarning dateTime={issue.createdAt}>{formatDate(issue.createdAt)}</time> · Updated{" "}
                    <time suppressHydrationWarning dateTime={issue.updatedAt}>{formatDate(issue.updatedAt)}</time>
                  </p>
                  <div className="flex items-center gap-2">
                    {canExplain ? (
                      <AiExplainToggle
                        open={isOpen}
                        onToggle={() => toggle(rowKey)}
                        controlsId={panelId}
                        issueNumber={issue.number}
                      />
                    ) : null}
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium text-text-secondary hover:text-accent"
                    >
                      View on GitHub <span aria-hidden="true">→</span>
                    </a>
                  </div>
                </div>
              </div>

              {isOpen ? (
                <div className="border-t border-border bg-surface-raised">
                  <AiExplanationPanel
                    id={panelId}
                    source="devtunnel"
                    repo={issue.project.repositoryFullName}
                    issueNumber={issue.number}
                    embedded
                  />
                </div>
              ) : null}
            </ClickableCard>
          </li>
        );
      })}
    </ul>
  );
}
