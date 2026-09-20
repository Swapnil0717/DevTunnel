"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SubmissionCard } from "@/components/submissions/submission-card";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { ListSkeleton } from "@/components/home/list-skeleton";
import { FilterSelect } from "@/components/ui/filter-select";
import { PlusIcon, SearchIcon } from "@/components/layout/nav-icons";
import { fetchSubmissions } from "@/lib/submissions/client-api";
import {
  DEFAULT_SUBMISSION_FILTERS,
  SUBMISSION_CATEGORY_LABEL,
  SUBMISSION_SORT_HINT,
  SUBMISSION_SORT_LABEL,
  type Submission,
  type SubmissionCategory,
  type SubmissionListFilters,
  type SubmissionSort,
} from "@/lib/submissions/types";

const SORTS: SubmissionSort[] = ["new", "trending", "popular"];
const CATEGORIES: SubmissionCategory[] = ["ALL", "PROJECT", "TOOL", "PAID_ALTERNATIVE"];

/** How long to wait after the last keystroke before re-querying. */
const SEARCH_DEBOUNCE_MS = 350;

/**
 * The Community page's body — filter bar, then the list.
 *
 * Unlike `DevtunnelProjectsExplorer` and `IssuesExplorer`, which fetch
 * once and narrow in the browser, every filter here goes back to the
 * server. That's not inconsistency: this list is capped at 200 rows, and
 * sorting a truncated page client-side would answer "most popular of the
 * 200 newest" while the control says "most popular". The trade is a
 * request per filter change; the debounce below keeps typing from
 * turning into one request per character.
 *
 * The tech-stack filter is the exception that proves it — its *options*
 * are derived from the rows currently loaded, so it only ever offers
 * tags that exist, but selecting one still re-queries so the result is a
 * true match across the whole list rather than within the page.
 *
 * `initialSubmissions` comes from the server render, so the first paint
 * has real rows instead of a skeleton that then fetches.
 */
export function SubmissionsExplorer({
  initialSubmissions,
  initialError,
}: {
  initialSubmissions: Submission[];
  initialError: boolean;
}) {
  const [filters, setFilters] = useState<SubmissionListFilters>(DEFAULT_SUBMISSION_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>(initialSubmissions);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(initialError);

  /** Skips the fetch on first render — the server already provided that exact page. */
  const isFirstRender = useRef(true);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setFilters((current) => ({ ...current, query: searchInput }));
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setHasError(false);

    fetchSubmissions(filters)
      .then((next) => {
        // A slower earlier request must not overwrite a newer result.
        if (!cancelled) setSubmissions(next);
      })
      .catch(() => {
        if (!cancelled) setHasError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters]);

  /**
   * Tech options come from the rows on screen — offering a tag nothing
   * carries would mean a filter that always returns nothing (rule 38).
   * Sorted by how many rows carry each, so the useful ones are near the
   * top rather than alphabetically scattered.
   */
  const techOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const submission of submissions) {
      for (const tag of submission.techStack) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    // Anything already selected stays listed even if the current page
    // doesn't include it, so a filter can always be cleared.
    for (const tag of filters.techStack) {
      if (!counts.has(tag)) counts.set(tag, 0);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag)
      .slice(0, 24);
  }, [submissions, filters.techStack]);

  function toggleTech(tag: string) {
    setFilters((current) => ({
      ...current,
      techStack: current.techStack.includes(tag)
        ? current.techStack.filter((value) => value !== tag)
        : [...current.techStack, tag],
    }));
  }

  const hasActiveFilters =
    filters.category !== "ALL" || filters.techStack.length > 0 || filters.query.trim() !== "";

  function clearFilters() {
    setSearchInput("");
    setFilters((current) => ({ ...DEFAULT_SUBMISSION_FILTERS, sort: current.sort }));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {CATEGORIES.map((category) => {
          const isActive = category === filters.category;
          return (
            <button
              key={category}
              type="button"
              onClick={() => setFilters((current) => ({ ...current, category }))}
              aria-pressed={isActive}
              className={`rounded-[7px] border px-2.5 py-1 text-[12px] transition-colors ${
                isActive
                  ? "border-border bg-surface-raised text-text"
                  : "border-border-subtle bg-transparent text-text-dim hover:text-text-muted"
              }`}
            >
              {SUBMISSION_CATEGORY_LABEL[category]}
            </button>
          );
        })}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-[8px] border border-border-subtle bg-bg px-2.5 py-1.5">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-text-faint" />
          <span className="sr-only">Search submissions by name</span>
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name"
            className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-text outline-none placeholder:text-text-faint"
          />
        </label>

        <FilterSelect
          id="submissions-sort"
          value={filters.sort}
          options={SORTS.map((sort) => ({
            value: sort,
            label: SUBMISSION_SORT_LABEL[sort],
          }))}
          onChange={(value) =>
            setFilters((current) => ({ ...current, sort: value as SubmissionSort }))
          }
        />

        <Link
          href="/submissions/new"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
        >
          <PlusIcon className="h-3.5 w-3.5 shrink-0" />
          Submit project or tool
        </Link>
      </div>

      {/* Says what the selected sort counts, so nobody has to infer it. */}
      <p className="m-0 mb-4 text-[11.5px] text-text-faint">
        {SUBMISSION_SORT_HINT[filters.sort]}
      </p>

      {techOptions.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11.5px] text-text-faint">Tech</span>
          {techOptions.map((tag) => {
            const isActive = filters.techStack.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTech(tag)}
                aria-pressed={isActive}
                className={`rounded-[6px] border px-2 py-[3px] text-[11px] transition-colors ${
                  isActive
                    ? "border-accent/40 bg-surface-selected text-status-success-label"
                    : "border-border-subtle bg-transparent text-text-dim hover:text-text-muted"
                }`}
              >
                {tag}
              </button>
            );
          })}
          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-1 text-[11.5px] text-text-faint underline-offset-2 hover:text-accent hover:underline"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : null}

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : hasError ? (
        <GithubEmptyState
          variant="no-results"
          title="Couldn't load submissions"
          description="The community list isn't reachable right now. Your filters are still set — try again in a moment."
        />
      ) : submissions.length === 0 ? (
        <GithubEmptyState
          variant="no-results"
          title={hasActiveFilters ? "Nothing matches those filters" : "Nothing submitted yet"}
          description={
            hasActiveFilters
              ? "No submission carries every tag you've selected. Try removing one, or widening the category."
              : "Nobody has submitted a project or tool yet. Whatever you've been using lately could be the first."
          }
          primaryAction={
            hasActiveFilters
              ? { label: "Clear filters", onClick: clearFilters }
              : { label: "Submit the first one", href: "/submissions/new" }
          }
        />
      ) : (
        <>
          <p className="m-0 mb-2.5 text-[11.5px] text-text-faint">
            {submissions.length.toLocaleString()}{" "}
            {submissions.length === 1 ? "submission" : "submissions"}
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {submissions.map((submission) => (
              <SubmissionCard key={submission.id} submission={submission} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
