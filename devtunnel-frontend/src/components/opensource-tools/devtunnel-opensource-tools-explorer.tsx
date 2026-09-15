"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { FilterSelect } from "@/components/ui/filter-select";
import { PagePaginationControls } from "@/components/admin/page-pagination-controls";
import { usePagePagination } from "@/lib/admin/use-page-pagination";
import { DevtunnelOpenSourceToolCard } from "./devtunnel-opensource-tool-card";
import type { OpenSourceToolSummary } from "@/lib/opensource-tools/types";

type SortOption = "NEWEST" | "NAME_ASC";

const SORT_FILTERS: { value: SortOption; label: string }[] = [
  { value: "NEWEST", label: "Newest" },
  { value: "NAME_ASC", label: "Name (A–Z)" },
];

const ALL_LANGUAGES = "ALL";
const ALL_LABELS = "ALL";

/**
 * Same 3-column / 12-per-page sizing `GithubProjectsExplorer` uses for
 * `/github-open-source-tools`'s own grid (`GITHUB_PROJECTS_PAGE_SIZE`) —
 * kept as its own constant, same reasoning `/projects`'s
 * `DEVTUNNEL_PROJECTS_PAGE_SIZE` documents for not importing that one
 * directly.
 */
const DEVTUNNEL_TOOLS_PAGE_SIZE = 12;

function sortTools(
  tools: OpenSourceToolSummary[],
  sortBy: SortOption,
): OpenSourceToolSummary[] {
  const sorted = [...tools];

  switch (sortBy) {
    case "NEWEST":
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return sorted;
    case "NAME_ASC":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      return sorted;
  }
}

/**
 * Client-side search + filter + sort bar for `/opensource-tools` ("Open
 * Source Tools on Devtunnel"), styled and structured the same way
 * `GithubProjectsExplorer` is for `/github-open-source-tools` — search
 * box, a row of labeled `FilterSelect` dropdowns, a 3-column card grid,
 * and 12-per-page numbered pagination — driven by one already-fetched
 * `OpenSourceToolSummary[]` (`getOpenSourceTools`,
 * `lib/opensource-tools/api.ts`) and narrowed entirely in the browser,
 * same "one real fetch" convention every Explorer in this app follows
 * (Frontend_Development_Rules.txt rule 58).
 *
 * The filters themselves differ from `GithubProjectsExplorer`'s only
 * because the underlying data does: **Language** and **Label** swap in
 * for Tech stack (built from what the fetched tools actually carry,
 * never a hardcoded catalog — same rule 58 reasoning), and **Sort by**
 * offers Newest / Name A–Z rather than Trending / Most stars / Recently
 * updated, since `OpenSourceToolSummary` has no star count and only one
 * real timestamp (`createdAt`) to sort by.
 */
export function DevtunnelOpenSourceToolsExplorer({
  tools,
}: {
  tools: OpenSourceToolSummary[];
}) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState(ALL_LANGUAGES);
  const [label, setLabel] = useState(ALL_LABELS);
  const [sortBy, setSortBy] = useState<SortOption>("NEWEST");

  const languageOptions = useMemo(() => {
    const values = new Set<string>();
    for (const tool of tools) {
      if (tool.primaryLanguage) values.add(tool.primaryLanguage);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [tools]);

  const labelOptions = useMemo(() => {
    const values = new Set<string>();
    for (const tool of tools) {
      for (const value of tool.labels) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [tools]);

  const filteredTools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = tools.filter((tool) => {
      if (language !== ALL_LANGUAGES && tool.primaryLanguage !== language) return false;
      if (label !== ALL_LABELS && !tool.labels.includes(label)) return false;

      if (!normalizedQuery) return true;

      const haystack = [
        tool.name,
        tool.sourceUrl,
        tool.description ?? "",
        tool.primaryLanguage ?? "",
        ...tool.labels,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    return sortTools(filtered, sortBy);
  }, [tools, query, language, label, sortBy]);

  const hasActiveFilters =
    query.trim().length > 0 || language !== ALL_LANGUAGES || label !== ALL_LABELS;

  const paged = usePagePagination(filteredTools, DEVTUNNEL_TOOLS_PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="devtunnel-opensource-tools-search" className="sr-only">
            Search open source tools by name, description, language, or label
          </label>

          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />

          <input
            id="devtunnel-opensource-tools-search"
            name="devtunnel-opensource-tools-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, description, language, or label"
            className="w-full rounded-[8px] border border-border bg-surface py-2 pl-8 pr-3 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="devtunnel-opensource-tools-language"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Language
            </label>
            <FilterSelect
              id="devtunnel-opensource-tools-language"
              value={language}
              onChange={setLanguage}
              options={[
                { value: ALL_LANGUAGES, label: "All languages" },
                ...languageOptions.map((value) => ({ value, label: value })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="devtunnel-opensource-tools-label"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Label
            </label>
            <FilterSelect
              id="devtunnel-opensource-tools-label"
              value={label}
              onChange={setLabel}
              options={[
                { value: ALL_LABELS, label: "All labels" },
                ...labelOptions.map((value) => ({ value, label: value })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="devtunnel-opensource-tools-sort"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Sort by
            </label>
            <FilterSelect
              id="devtunnel-opensource-tools-sort"
              value={sortBy}
              onChange={(value) => setSortBy(value as SortOption)}
              options={SORT_FILTERS}
            />
          </div>
        </div>
      </div>

      {filteredTools.length === 0 ? (
        <SectionMessage>
          {hasActiveFilters
            ? "No tools match your search or the selected filters. Try different search terms or filters."
            : "No open source tools have been added yet — check back soon."}
        </SectionMessage>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paged.pageItems.map((tool) => (
              <DevtunnelOpenSourceToolCard key={tool.id} tool={tool} />
            ))}
          </div>

          <PagePaginationControls
            page={paged.page}
            totalPages={paged.totalPages}
            onPageChange={paged.setPage}
            rangeStart={paged.rangeStart}
            rangeEnd={paged.rangeEnd}
            totalItems={paged.totalItems}
            itemLabel="tool"
          />
        </>
      )}
    </div>
  );
}