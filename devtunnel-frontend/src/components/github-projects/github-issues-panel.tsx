"use client";

import { useMemo } from "react";
import { AiExplainButton } from "@/components/ai/ai-explain-button";
import { IssueInsightBadges, IssueInsightsCard } from "@/components/ai/issue-insights-card";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { LoadAllIssuesBar } from "@/components/issues/load-all-issues-bar";
import { PagePaginationControls } from "@/components/admin/page-pagination-controls";
import { usePagePagination } from "@/lib/admin/use-page-pagination";
import { parseGithubRepoFullName } from "@/lib/ai/explain-client";
import { useIssueInsights } from "@/lib/ai/use-issue-insights";
import { REPO_ISSUES_PAGE_SIZE, type LoadAllIssuesState } from "@/lib/issues/use-load-all-issues";
import type { GithubProjectIssuePreview } from "@/lib/github-projects/types";

/**
 * Issues tab body for a GitHub-catalog repository — used by both
 * `/github-projects/:slug` and `/github-open-source-tools/:slug`, which
 * share `GithubProjectDetailTabs` because their detail shape is identical.
 *
 * The repository's currently-open issues, each linking straight out to
 * the real GitHub issue — this app has no issue tracker of its own for a
 * repository DevTunnel hasn't onboarded, so "read more on GitHub" is the
 * honest destination, same posture `IssuesTable` takes for `/issues`.
 *
 * The page ships only a first-page preview of the backlog. `loader` (see
 * `useLoadAllIssues`, held by the tabs component so it survives tab
 * switches) is what turns that preview into the complete list on
 * request, and the list is paginated client-side — 10 per page, via the
 * same `usePagePagination`/`PagePaginationControls` every other
 * contributor list here uses — so loading a few hundred issues never
 * means rendering a few hundred rows at once.
 *
 * Each row also gets an "Explain" button (Part 5, `AiExplainButton`): a
 * signed-in visitor can expand an AI-written, plain-language explanation of
 * the issue inline. The button sits BESIDE the row's link rather than inside
 * it — a `<button>` nested in an `<a>` is invalid HTML — so the row's own
 * hover highlight now covers the link only.
 *
 * Above the list sits the AI issue insights card (Part 6,
 * `IssueInsightsCard`): on request it labels the repository's open issues by
 * role, level and technology. Its filter chips narrow `issues` BEFORE the
 * client-side pagination below (so "page 1 of 2" always describes the
 * filtered list), each row shows its own AI labels next to the Explain
 * button, and an issue the AI didn't analyze says so rather than guessing.
 *
 * A repository with zero open issues gets the "issues-clear" variant,
 * framed as a good result (a checkmark, not a "nothing here" box) —
 * but only when that's actually known: a repository GitHub says has open
 * items while the preview came back empty (e.g. the newest items were all
 * pull requests) offers "Load all issues" instead of claiming it's clear.
 */
export function GithubIssuesPanel({
  loader,
  repositoryUrl,
}: {
  loader: LoadAllIssuesState<GithubProjectIssuePreview>;
  repositoryUrl: string;
}) {
  const { issues, canLoadMore } = loader;
  // `null` (no Explain button, no insights card) if the URL isn't a github.com repository.
  const repoFullName = parseGithubRepoFullName(repositoryUrl);
  // The catalog endpoint only returns open issues. After "Load all issues" the ones without an AI insight yet
  // are analysed (only once the visitor has pressed "Analyze issues").
  const openIssueNumbers = useMemo(() => issues.map((issue) => issue.number), [issues]);
  const insights = useIssueInsights(repoFullName, openIssueNumbers);
  const { filterIssues } = insights;
  // The insight filters run BEFORE pagination; with no filter active this is `issues` itself.
  const visibleIssues = useMemo(() => filterIssues(issues), [filterIssues, issues]);
  const paged = usePagePagination(visibleIssues, REPO_ISSUES_PAGE_SIZE);

  if (issues.length === 0 && !canLoadMore) {
    return (
      <GithubEmptyState
        compact
        variant="issues-clear"
        title="All caught up"
        description="No open issues right now — this repository has nothing waiting on it."
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
      <IssueInsightsCard controller={insights} />

      <LoadAllIssuesBar loader={loader} repositoryUrl={repositoryUrl} />

      {issues.length === 0 ? null : visibleIssues.length === 0 ? (
        <p className="m-0 rounded-[8px] border border-dashed border-border-subtle px-4 py-6 text-center text-[12.5px] text-text-muted">
          No analyzed issues match those filters. Clear a filter to see more.
        </p>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col divide-y divide-border-subtle p-0">
            {paged.pageItems.map((issue) => (
              <li key={issue.id}>
                <a
                  href={issue.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex flex-col gap-1 rounded-md px-3 py-2.5 hover:bg-surface-raised"
                >
                  <span className="flex items-center gap-2 text-[13px] text-text">
                    <span className="font-mono text-text-muted">#{issue.number}</span>
                    {issue.title}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-faint">
                    <time suppressHydrationWarning dateTime={issue.createdAt}>
                      Opened {new Date(issue.createdAt).toLocaleDateString()}
                    </time>
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
                {repoFullName ? (
                  <div className="flex flex-col gap-1.5 px-3 pb-2.5">
                    <IssueInsightBadges controller={insights} issueNumber={issue.number} />
                    <AiExplainButton source="github" repo={repoFullName} issueNumber={issue.number} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          <PagePaginationControls
            page={paged.page}
            totalPages={paged.totalPages}
            onPageChange={paged.setPage}
            rangeStart={paged.rangeStart}
            rangeEnd={paged.rangeEnd}
            totalItems={paged.totalItems}
            itemLabel="issue"
          />
        </>
      )}
    </div>
  );
}
