"use client";

import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { LoadAllIssuesBar } from "@/components/issues/load-all-issues-bar";
import { PagePaginationControls } from "@/components/admin/page-pagination-controls";
import { usePagePagination } from "@/lib/admin/use-page-pagination";
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
  const paged = usePagePagination(issues, REPO_ISSUES_PAGE_SIZE);

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
      <LoadAllIssuesBar loader={loader} repositoryUrl={repositoryUrl} />

      {issues.length === 0 ? null : (
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
                    <time dateTime={issue.createdAt}>
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
