"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { FilterSelect } from "@/components/ui/filter-select";
import { PagePaginationControls } from "@/components/admin/page-pagination-controls";
import { usePagePagination } from "@/lib/admin/use-page-pagination";
import { DevtunnelProjectCard } from "./devtunnel-project-card";
import type { ProjectSummary } from "@/lib/home/types";

type SortOption = "BEST_MATCH" | "NAME_ASC";

const SORT_FILTERS: { value: SortOption; label: string }[] = [
  { value: "BEST_MATCH", label: "Best match" },
  { value: "NAME_ASC", label: "Name (A–Z)" },
];

const ALL_TECH = "ALL";

type ShowFilter = "ALL" | "RECOMMENDED";

const SHOW_FILTERS: { value: ShowFilter; label: string }[] = [
  { value: "ALL", label: "All projects" },
  { value: "RECOMMENDED", label: "Recommended for you" },
];

/**
 * Same 3-column / 12-per-page sizing `GithubProjectsExplorer` uses for
 * its own contributor-facing grid (`GITHUB_PROJECTS_PAGE_SIZE`) — kept
 * as its own constant rather than importing that one, since the two
 * pages' data (and the component reading it) are otherwise unrelated.
 */
const DEVTUNNEL_PROJECTS_PAGE_SIZE = 12;

function sortProjects(projects: ProjectSummary[], sortBy: SortOption): ProjectSummary[] {
  const sorted = [...projects];

  switch (sortBy) {
    case "BEST_MATCH":
      // Undefined matchPercent (no recommendation yet) sorts after every
      // real match score, never treated as 0 — that would misrepresent
      // "no data" as "a 0% match" (rule 58).
      sorted.sort((a, b) => {
        const aMatch = a.matchPercent ?? -1;
        const bMatch = b.matchPercent ?? -1;
        if (aMatch !== bMatch) return bMatch - aMatch;
        return a.name.localeCompare(b.name);
      });
      return sorted;
    case "NAME_ASC":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      return sorted;
  }
}

/**
 * Client-side search + filter + sort bar for `/projects` ("Projects on
 * Devtunnel"), driven by one already-fetched `ProjectSummary[]`
 * (`getRecommendedProjects`, `GET /projects/available` —
 * `lib/home/api.ts`) — narrowed and re-ordered here, then paginated
 * 12-per-page, the same "one real fetch, filtered/sorted/paginated
 * entirely in the browser" convention `GithubProjectsExplorer` and
 * `AdminProjectsExplorer` both already follow (Frontend_Development_Rules.txt
 * rule 58: never stand up a second, fabricated data source just to
 * support a filter).
 *
 * Three controls, matching what this page's real data can actually
 * support: **Tech stack** (built from the `primaryTech` values the
 * fetched projects actually carry, never a hardcoded catalog), **Show**
 * (All projects / Recommended for you — recommended meaning a real
 * `matchPercent` came back for that project, not a separate backend
 * query, since `/projects/available` already returns match data inline;
 * this is also what `RecommendedProjectsSection`'s "See all" link on the
 * home page points at via `?recommended=true`), and **Sort by** (Best
 * match / Name A–Z — no stars/forks/recency to sort by here, unlike
 * `GithubProjectsExplorer`, since `ProjectSummary` doesn't carry any of
 * that).
 */
export function DevtunnelProjectsExplorer({
  projects,
  initialShowFilter = "ALL",
}: {
  projects: ProjectSummary[];
  /** Seeds the "Show" filter from `?recommended=true` on first render. */
  initialShowFilter?: ShowFilter;
}) {
  const [query, setQuery] = useState("");
  const [techStack, setTechStack] = useState(ALL_TECH);
  const [show, setShow] = useState<ShowFilter>(initialShowFilter);
  const [sortBy, setSortBy] = useState<SortOption>("BEST_MATCH");

  const techStackOptions = useMemo(() => {
    const values = new Set<string>();
    for (const project of projects) values.add(project.primaryTech);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const filtered = projects.filter((project) => {
      if (techStack !== ALL_TECH && project.primaryTech !== techStack) return false;
      if (show === "RECOMMENDED" && typeof project.matchPercent !== "number") return false;

      if (!normalizedQuery) return true;

      const haystack = [
        project.name,
        project.description,
        project.primaryTech,
        project.matchRole ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    return sortProjects(filtered, sortBy);
  }, [projects, query, techStack, show, sortBy]);

  const hasActiveFilters =
    query.trim().length > 0 || techStack !== ALL_TECH || show !== "ALL";

  const paged = usePagePagination(filteredProjects, DEVTUNNEL_PROJECTS_PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="devtunnel-projects-search" className="sr-only">
            Search projects by name, description, or tech stack
          </label>

          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />

          <input
            id="devtunnel-projects-search"
            name="devtunnel-projects-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by project, description, or tech stack"
            className="w-full rounded-[8px] border border-border bg-surface py-2 pl-8 pr-3 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="devtunnel-projects-show"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Show
            </label>
            <FilterSelect
              id="devtunnel-projects-show"
              value={show}
              onChange={(value) => setShow(value as ShowFilter)}
              options={SHOW_FILTERS}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="devtunnel-projects-techstack"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Tech stack
            </label>
            <FilterSelect
              id="devtunnel-projects-techstack"
              value={techStack}
              onChange={setTechStack}
              options={[
                { value: ALL_TECH, label: "All tech stacks" },
                ...techStackOptions.map((value) => ({ value, label: value })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="devtunnel-projects-sort"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Sort by
            </label>
            <FilterSelect
              id="devtunnel-projects-sort"
              value={sortBy}
              onChange={(value) => setSortBy(value as SortOption)}
              options={SORT_FILTERS}
            />
          </div>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <SectionMessage>
          {hasActiveFilters
            ? "No projects match your search or the selected filters. Try different search terms or filters."
            : "No projects have been added yet — check back soon."}
        </SectionMessage>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paged.pageItems.map((project) => (
              <DevtunnelProjectCard key={project.slug} project={project} />
            ))}
          </div>

          <PagePaginationControls
            page={paged.page}
            totalPages={paged.totalPages}
            onPageChange={paged.setPage}
            rangeStart={paged.rangeStart}
            rangeEnd={paged.rangeEnd}
            totalItems={paged.totalItems}
            itemLabel="project"
          />
        </>
      )}
    </div>
  );
}