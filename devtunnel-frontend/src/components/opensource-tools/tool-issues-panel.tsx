"use client";

import { useMemo, useState } from "react";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { IssueIcon, SearchIcon } from "@/components/layout/nav-icons";
import type { OpenSourceToolIssuePreview } from "@/lib/opensource-tools/types";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * "All Issues" tab of the Tool Detail page — the tool repository's open
 * issues, each linking straight out to the real GitHub issue.
 *
 * Thinner than the project page's equivalent (`ProjectIssuesPanel`), and
 * the difference is real rather than cosmetic: a tool's issues come back
 * as `GithubProjectIssuePreview` rows, which carry no open/closed state
 * (the endpoint only returns open ones) and no per-issue author, so
 * there's no state filter here and no `@author` line. Rendering either
 * would mean inventing a field the payload doesn't have
 * (Frontend_Development_Rules.txt rule 58).
 *
 * Search stays, since a tool with a long issue list is exactly where
 * "does anyone else have my problem?" gets asked.
 */
export function ToolIssuesPanel({
  issues,
  repositoryUrl,
}: {
  issues: OpenSourceToolIssuePreview[];
  /** `null` when the tool has no GitHub repository — the empty state adapts. */
  repositoryUrl: string | null;
}) {
  const [query, setQuery] = useState("");

  const visibleIssues = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return issues;
    return issues.filter(
      (issue) =>
        issue.title.toLowerCase().includes(normalized) ||
        String(issue.number).includes(normalized) ||
        issue.labels.some((label) => label.toLowerCase().includes(normalized)),
    );
  }, [issues, query]);

  if (!repositoryUrl) {
    return (
      <GithubEmptyState
        compact
        variant="no-results"
        title="No issue tracker to show"
        description="This tool's source isn't a GitHub repository, so there's no issue list DevTunnel can read. The tool's own site is the place to report something."
      />
    );
  }

  if (issues.length === 0) {
    return (
      <GithubEmptyState
        compact
        variant="issues-clear"
        title="All caught up"
        description="No open issues right now — this tool has nothing waiting on it."
        primaryAction={{
          label: "View issues on GitHub",
          href: `${repositoryUrl}/issues`,
          external: true,
        }}
      />
    );
  }

  return (
    <div>
      <div className="relative mb-3 max-w-[260px]">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search issues"
          aria-label="Search issues on this tool"
          className="w-full rounded-[7px] border border-border-subtle bg-surface-raised py-1.5 pl-8 pr-2.5 text-[12px] text-text placeholder:text-text-faint"
        />
      </div>

      {visibleIssues.length === 0 ? (
        <p className="m-0 rounded-[8px] border border-dashed border-border-subtle px-4 py-6 text-center text-[12.5px] text-text-muted">
          No issues match that search. Try a different term.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-border-subtle p-0">
          {visibleIssues.map((issue) => (
            <li key={issue.id}>
              <a
                href={issue.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex flex-col gap-1 rounded-md px-3 py-2.5 hover:bg-surface-raised"
              >
                <span className="flex items-start gap-2 text-[13px] text-text">
                  <IssueIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-status-idle-text" />
                  <span>
                    <span className="block">{issue.title}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-text-faint">
                      #{issue.number}
                    </span>
                  </span>
                </span>

                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-[22px] text-[11px] text-text-faint">
                  <time dateTime={issue.createdAt}>Opened {formatDate(issue.createdAt)}</time>
                  {issue.commentCount > 0 ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {issue.commentCount.toLocaleString()} comment
                        {issue.commentCount === 1 ? "" : "s"}
                      </span>
                    </>
                  ) : null}
                  {issue.labels.map((label) => (
                    <span
                      key={label}
                      className="rounded-[5px] border border-border-subtle px-[6px] py-[1px] text-[10px] text-text-faint"
                    >
                      {label}
                    </span>
                  ))}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
