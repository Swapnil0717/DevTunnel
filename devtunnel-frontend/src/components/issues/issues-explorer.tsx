"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { FilterSelect } from "@/components/ui/filter-select";
import { PagePaginationControls } from "@/components/admin/page-pagination-controls";
import { usePagePagination } from "@/lib/admin/use-page-pagination";
import { useAuth } from "@/lib/auth/use-auth";
import { useLoadIssueList } from "@/lib/issues/use-load-issue-list";
import { IssuesTable } from "./issues-table";
import { LoadIssueListBar } from "./load-issue-list-bar";
import type { Issue, IssueState } from "@/lib/issues/types";

type StateFilter = "ALL" | IssueState;

const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: "ALL", label: "All states" },
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" },
];

/**
 * Contributor-facing page size — deliberately smaller than
 * `ADMIN_PAGE_SIZE` (20). An admin working the New Issues queue wants to
 * scan as many rows as possible at once; a contributor browsing for
 * something to pick up benefits more from a shorter, less overwhelming
 * list per page. Passed explicitly to `usePagePagination` below rather
 * than relying on its default.
 */
const ISSUES_PAGE_SIZE = 10;

/**
 * Client-side search + filter bar for `/issues` ("All Issues"), driven
 * by the `GET /issues` list (`lib/issues/api.ts`) — narrowed here, then
 * paginated 10-per-page (`ISSUES_PAGE_SIZE`) — never a second fabricated
 * data source (Frontend_Development_Rules.txt rule 58). Same convention
 * as `AdminNewIssuesExplorer`, minus the admin-only curation actions and
 * at a smaller page size (see `ISSUES_PAGE_SIZE`).
 *
 * The server ships only the most recently updated first page of issues
 * (`ISSUES_PREVIEW_LIMIT`) so the page appears quickly; when the backend
 * has more (`hasMore`), `LoadIssueListBar` offers a "Load all issues"
 * button that fetches the rest from the browser
 * (`useLoadIssueList`), and the explorer's search, filters and pagination
 * then run over the complete list. Until then the bar says outright that
 * they only cover what's loaded.
 *
 * `usePagePagination` and `PagePaginationControls` are reused from the
 * Admin Portal rather than duplicated: both are generic, role-agnostic
 * pagination utilities over an already-filtered in-memory array, with no
 * admin-only coupling — copying them here would just be the same logic
 * twice (rule 51).
 *
 * Tech stack starts at "All" like every other filter here — a "Match my
 * profile" toggle (`profileTechStack` below, sourced from
 * `useAuth().user.technologies`) lets the contributor apply their own
 * onboarding answer in one click when it's actually one of this issue
 * list's own `techStackOptions`; the toggle simply doesn't render when
 * there's no match to apply. State/Repository/Author/Project have no
 * onboarding equivalent, so they stay at "All" until the contributor
 * picks one manually.
 */
export function IssuesExplorer({
  issues: initialIssues,
  hasMore,
}: {
  /** The server-rendered first page — the most recently updated open issues. */
  issues: Issue[];
  /** `true` when the backend holds more issues than `issues` — offers "Load all issues". */
  hasMore: boolean;
}) {
  const { user } = useAuth();

  const issueList = useLoadIssueList({ initialIssues, hasMore });
  const issues = issueList.issues;

  const [query, setQuery] = useState("");
  const [state, setState] = useState<StateFilter>("ALL");
  const [repository, setRepository] = useState("ALL");
  const [author, setAuthor] = useState("ALL");
  const [techStack, setTechStack] = useState("ALL");
  const [projectSlug, setProjectSlug] = useState("ALL");

  const repositoryOptions = useMemo(() => {
    const values = new Set<string>();
    for (const issue of issues) values.add(issue.project.repositoryFullName);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [issues]);

  const authorOptions = useMemo(() => {
    const values = new Set<string>();
    for (const issue of issues) values.add(issue.author.username);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [issues]);

  const techStackOptions = useMemo(() => {
    const values = new Set<string>();
    for (const issue of issues) {
      for (const value of issue.project.techStack) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [issues]);

  const profileTechStack = useMemo(
    () => user?.technologies.find((value) => techStackOptions.includes(value)) ?? null,
    [user, techStackOptions],
  );

  const isFilteredToProfile = profileTechStack !== null && techStack === profileTechStack;

  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const issue of issues) {
      if (!seen.has(issue.project.slug)) {
        seen.set(issue.project.slug, issue.project.name);
      }
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [issues]);

  const filteredIssues = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return issues.filter((issue) => {
      if (state !== "ALL" && issue.state !== state) return false;
      if (repository !== "ALL" && issue.project.repositoryFullName !== repository) return false;
      if (author !== "ALL" && issue.author.username !== author) return false;
      if (techStack !== "ALL" && !issue.project.techStack.includes(techStack)) return false;
      if (projectSlug !== "ALL" && issue.project.slug !== projectSlug) return false;

      if (!normalizedQuery) return true;

      const haystack = [
        issue.title,
        `#${issue.number}`,
        issue.project.name,
        issue.project.repositoryFullName,
        issue.author.username,
        issue.author.name ?? "",
        ...issue.labels,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [issues, query, state, repository, author, techStack, projectSlug]);

  const hasActiveFilters =
    query.trim().length > 0 ||
    state !== "ALL" ||
    repository !== "ALL" ||
    author !== "ALL" ||
    techStack !== "ALL" ||
    projectSlug !== "ALL";

  const paged = usePagePagination(filteredIssues, ISSUES_PAGE_SIZE);

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="issues-search" className="sr-only">
            Search issues by title, project, repository, author, or label
          </label>

          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />

          <input
            id="issues-search"
            name="issues-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by issue, project, repository, author, or label"
            className="w-full rounded-[8px] border border-border bg-surface py-2 pl-8 pr-3 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        {profileTechStack !== null ? (
          isFilteredToProfile ? (
            <p className="m-0 flex items-center gap-2 text-[11.5px] text-text-faint">
              Filtered to your profile.
              <button
                type="button"
                onClick={() => setTechStack("ALL")}
                className="font-medium text-accent hover:underline"
              >
                Show all issues
              </button>
            </p>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setTechStack(profileTechStack)}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[11.5px] font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
              >
                Match my profile
              </button>
            </div>
          )
        ) : null}

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="issues-state"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              State
            </label>
            <FilterSelect
              id="issues-state"
              value={state}
              onChange={(value) => setState(value as StateFilter)}
              options={STATE_FILTERS}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="issues-repository"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Repository
            </label>
            <FilterSelect
              id="issues-repository"
              value={repository}
              onChange={setRepository}
              options={[
                { value: "ALL", label: "All repositories" },
                ...repositoryOptions.map((value) => ({ value, label: value })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="issues-author"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Author
            </label>
            <FilterSelect
              id="issues-author"
              value={author}
              onChange={setAuthor}
              options={[
                { value: "ALL", label: "All authors" },
                ...authorOptions.map((value) => ({ value, label: `@${value}` })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="issues-techstack"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Tech stack
            </label>
            <FilterSelect
              id="issues-techstack"
              value={techStack}
              onChange={setTechStack}
              options={[
                { value: "ALL", label: "All tech stacks" },
                ...techStackOptions.map((value) => ({ value, label: value })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="issues-project"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Project
            </label>
            <FilterSelect
              id="issues-project"
              value={projectSlug}
              onChange={setProjectSlug}
              options={[
                { value: "ALL", label: "All projects" },
                ...projectOptions.map(([slug, name]) => ({ value: slug, label: name })),
              ]}
            />
          </div>
        </div>
      </div>

      <LoadIssueListBar loader={issueList} />

      {filteredIssues.length === 0 ? (
        <SectionMessage>
          {hasActiveFilters
            ? "No issues match your search or the selected filters. Try different search terms or filters."
            : "No open GitHub issues right now — check back soon."}
        </SectionMessage>
      ) : (
        <>
          <IssuesTable issues={paged.pageItems} />
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