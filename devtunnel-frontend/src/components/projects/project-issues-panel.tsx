"use client";

import { useMemo, useState } from "react";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { LoadAllIssuesBar } from "@/components/issues/load-all-issues-bar";
import { IssueIcon, SearchIcon } from "@/components/layout/nav-icons";
import { PagePaginationControls } from "@/components/admin/page-pagination-controls";
import { usePagePagination } from "@/lib/admin/use-page-pagination";
import { REPO_ISSUES_PAGE_SIZE, type LoadAllIssuesState } from "@/lib/issues/use-load-all-issues";
import type { Issue, IssueState } from "@/lib/issues/types";

type StateFilter = "ALL" | IssueState;

const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" },
];

/** How many labels to show inline on a row before collapsing into "+N". */
const MAX_VISIBLE_LABELS = 3;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * "All Issues" tab of the View Project page — every GitHub issue on this
 * project's repository, open and closed, as DevTunnel last read them.
 *
 * Distinct from the Tasks tab next to it, and the distinction matters to
 * a contributor: a *task* is something DevTunnel has curated (role,
 * difficulty, tech stack, a DevTunnel status), while an *issue* is the
 * raw GitHub object with none of that layered on. Which is also why every
 * row here opens GitHub rather than a DevTunnel page — an issue that
 * hasn't been turned into a task has no page of its own to show instead,
 * the same honest posture `IssuesTable` takes for `/issues`.
 *
 * `IssuesTable` itself isn't reused for the same reason `TasksTable`
 * isn't in the Tasks panel: it's a 960px-wide cross-project table with a
 * Project column that would repeat the page's own header on every single
 * row. This is the same information as rows that fit the tab's column.
 *
 * Closed issues are shown rather than filtered out — an issue closing
 * upstream while someone was reading about it is exactly the thing they
 * need to see (same reasoning `Issue.state` exists at all in
 * `lib/issues/types.ts`) — and the state is always the word "Open" or
 * "Closed", never a color alone (rule 43).
 *
 * The page ships only a first-page preview of the backlog. `loader` (see
 * `useLoadAllIssues`, held by `ProjectDetailTabs` so it survives tab
 * switches) is what turns that preview into the repository's complete
 * open-issue list when the contributor presses "Load all issues" — and
 * search and the state filter then run over *all* of it, not just the
 * preview. Whatever survives the filters is paginated client-side, 10 per
 * page (`usePagePagination`, the same as `/issues`), so a few hundred
 * loaded issues never means a few hundred rows on screen.
 *
 * Note the backend only ever returns *open* issues here, so the Closed
 * filter's count is always 0 — see `GET /projects/:slug` — which is
 * unchanged by loading them all.
 */
export function ProjectIssuesPanel({
  loader,
  repositoryUrl,
}: {
  loader: LoadAllIssuesState<Issue>;
  repositoryUrl: string;
}) {
  const { issues, canLoadMore } = loader;
  const [stateFilter, setStateFilter] = useState<StateFilter>("OPEN");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const byState: Record<string, number> = { ALL: issues.length, OPEN: 0, CLOSED: 0 };
    for (const issue of issues) byState[issue.state] = (byState[issue.state] ?? 0) + 1;
    return byState;
  }, [issues]);

  const visibleIssues = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return issues.filter((issue) => {
      if (stateFilter !== "ALL" && issue.state !== stateFilter) return false;
      if (!normalized) return true;
      return (
        issue.title.toLowerCase().includes(normalized) ||
        String(issue.number).includes(normalized) ||
        issue.labels.some((label) => label.toLowerCase().includes(normalized))
      );
    });
  }, [issues, stateFilter, query]);

  const paged = usePagePagination(visibleIssues, REPO_ISSUES_PAGE_SIZE);

  // Only "all caught up" when that's actually known — a repository GitHub
  // says still has open items, whose preview came back empty (GitHub was
  // unreachable, or the newest items were all pull requests), gets the
  // "Load all issues" action below instead of a false all-clear.
  if (issues.length === 0 && !canLoadMore) {
    return (
      <GithubEmptyState
        compact
        variant="issues-clear"
        title="All caught up"
        description="No issues on this repository right now — there's nothing waiting on it."
        primaryAction={{
          label: "View issues on GitHub",
          href: `${repositoryUrl}/issues`,
          external: true,
        }}
      />
    );
  }

  // Nothing loaded, but GitHub says there's more (so `canLoadMore` holds):
  // there's nothing to filter or page yet — just offer the action.
  if (issues.length === 0) {
    return <LoadAllIssuesBar loader={loader} repositoryUrl={repositoryUrl} />;
  }

  return (
    <div>
      <LoadAllIssuesBar loader={loader} repositoryUrl={repositoryUrl} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATE_FILTERS.map((filter) => {
            const isActive = filter.value === stateFilter;
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStateFilter(filter.value)}
                aria-pressed={isActive}
                className={`inline-flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1 text-[12px] transition-colors ${
                  isActive
                    ? "border-border bg-surface-raised text-text"
                    : "border-border-subtle bg-transparent text-text-dim hover:text-text-muted"
                }`}
              >
                {filter.label}
                <span className="text-[11px] text-text-faint">{counts[filter.value] ?? 0}</span>
              </button>
            );
          })}
        </div>

        <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-[240px]">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search issues"
            aria-label="Search issues in this project"
            className="w-full rounded-[7px] border border-border-subtle bg-surface-raised py-1.5 pl-8 pr-2.5 text-[12px] text-text placeholder:text-text-faint"
          />
        </div>
      </div>

      {visibleIssues.length === 0 ? (
        <p className="m-0 rounded-[8px] border border-dashed border-border-subtle px-4 py-6 text-center text-[12.5px] text-text-muted">
          No issues match that search. Try a different term or filter.
        </p>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col divide-y divide-border-subtle p-0">
            {paged.pageItems.map((issue) => {
              const visibleLabels = issue.labels.slice(0, MAX_VISIBLE_LABELS);
              const hiddenLabelCount = issue.labels.length - visibleLabels.length;

              return (
                <li key={issue.number}>
                  <a
                    href={issue.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex flex-col gap-1 rounded-md px-3 py-2.5 hover:bg-surface-raised"
                  >
                    <span className="flex items-start gap-2 text-[13px] text-text">
                      <IssueIcon
                        className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                          issue.state === "OPEN" ? "text-status-idle-text" : "text-text-faint"
                        }`}
                      />
                      <span>
                        <span className="block">{issue.title}</span>
                        <span className="mt-0.5 block font-mono text-[11px] text-text-faint">
                          #{issue.number} · {issue.state === "OPEN" ? "Open" : "Closed"}
                        </span>
                      </span>
                    </span>

                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-[22px] text-[11px] text-text-faint">
                      <span>@{issue.author.username}</span>
                      <span aria-hidden="true">·</span>
                      <time dateTime={issue.createdAt}>Opened {formatDate(issue.createdAt)}</time>
                      <span aria-hidden="true">·</span>
                      <time dateTime={issue.updatedAt}>Updated {formatDate(issue.updatedAt)}</time>
                      {visibleLabels.map((label) => (
                        <span
                          key={label}
                          className="rounded-[5px] border border-border-subtle px-[6px] py-[1px] text-[10px] text-text-faint"
                        >
                          {label}
                        </span>
                      ))}
                      {hiddenLabelCount > 0 ? <span>+{hiddenLabelCount}</span> : null}
                    </span>
                  </a>
                </li>
              );
            })}
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
