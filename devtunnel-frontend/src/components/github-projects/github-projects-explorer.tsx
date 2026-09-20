"use client";

import { useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SearchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { FilterSelect } from "@/components/ui/filter-select";
import { PagePaginationControls } from "@/components/admin/page-pagination-controls";
import { usePagePagination } from "@/lib/admin/use-page-pagination";
import { GithubProjectCard } from "./github-project-card";
import { LoadCatalogBar } from "./load-catalog-bar";
import { useLoadFullCatalog } from "@/lib/github-projects/use-load-full-catalog";
import type { GithubProjectSummary } from "@/lib/github-projects/types";

type SortOption = "TRENDING" | "MOST_STARS" | "NEWEST" | "RECENTLY_UPDATED";

const SORT_FILTERS: { value: SortOption; label: string }[] = [
  { value: "TRENDING", label: "Trending" },
  { value: "MOST_STARS", label: "Most stars (Popular)" },
  { value: "NEWEST", label: "Newest" },
  { value: "RECENTLY_UPDATED", label: "Recently updated" },
];

const ALL_TECH = "ALL";
const ALL_STARS = "ALL";

/** Sentinel `catalogFilter` value meaning "no named filter selected" — mirrors `ALL_TECH`/`ALL_STARS` above. */
export const NO_CATALOG_FILTER = "ALL";

export interface CatalogFilterOption {
  value: string;
  label: string;
}

export interface CatalogFilterConfig {
  /** Query param name this filter reads from/writes to, e.g. `"filter"`. */
  paramName: string;
  /** Currently active value — `NO_CATALOG_FILTER` means none selected. */
  value: string;
  /** Options shown in the dropdown, including a `NO_CATALOG_FILTER` "no filter" entry. */
  options: CatalogFilterOption[];
}

/**
 * What the "Load all" button needs to fetch the rest of a catalog. The
 * server-rendered page ships only the first page (the most-starred rows);
 * this tells the explorer where the remainder lives.
 */
export interface CatalogLoadConfig {
  /** Backend list route to load from, e.g. `"/github-projects"`. */
  path: string;
  /** Plural noun for the button/status copy — `"projects"` or `"tools"`. */
  noun: string;
  /** The catalog's own `?filter=` value when one is active, so the load asks for the same population the preview came from. */
  filter?: string;
  /** Whether rows exist past the preview (the backend's `X-Next-Cursor`, read server-side). `false` hides the button. */
  hasMore: boolean;
}

/** "500+ stars" style thresholds — a project matches when `stars >= value`. */
const STARS_FILTERS: { value: string; label: string }[] = [
  { value: ALL_STARS, label: "Any stars" },
  { value: "10", label: "10+ stars" },
  { value: "100", label: "100+ stars" },
  { value: "500", label: "500+ stars" },
  { value: "1000", label: "1,000+ stars" },
  { value: "5000", label: "5,000+ stars" },
  { value: "10000", label: "10,000+ stars" },
];

/**
 * Contributor-facing page size — a 3-column grid at the `lg` breakpoint,
 * so 12 fills exactly 4 full rows. Deliberately smaller than
 * `ADMIN_PAGE_SIZE` (20), same reasoning `IssuesExplorer` documents for
 * its own `ISSUES_PAGE_SIZE`: a contributor browsing benefits from a
 * shorter, less overwhelming page than an admin scanning a queue does.
 */
const GITHUB_PROJECTS_PAGE_SIZE = 12;

/**
 * Recency window "Trending" treats a repository as currently active.
 * There's no historical star-delta data available (no backend field for
 * "stars gained in the last 30 days"), so this can never be a genuine
 * trending *score* — only a heuristic re-ordering of real fields the API
 * already returned (`stars`, `pushedAt`). Frontend_Development_Rules.txt
 * rules 58/59: never invent a statistic the backend hasn't actually
 * given us.
 */
const TRENDING_RECENCY_MS = 30 * 24 * 60 * 60 * 1000;

function sortProjects(
  projects: GithubProjectSummary[],
  sortBy: SortOption,
): GithubProjectSummary[] {
  const sorted = [...projects];

  switch (sortBy) {
    case "TRENDING": {
      const now = Date.now();
      sorted.sort((a, b) => {
        const aRecent = now - new Date(a.pushedAt).getTime() <= TRENDING_RECENCY_MS;
        const bRecent = now - new Date(b.pushedAt).getTime() <= TRENDING_RECENCY_MS;
        if (aRecent !== bRecent) return aRecent ? -1 : 1;
        return b.stars - a.stars;
      });
      return sorted;
    }
    case "MOST_STARS":
      sorted.sort((a, b) => b.stars - a.stars);
      return sorted;
    case "NEWEST":
      sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return sorted;
    case "RECENTLY_UPDATED":
      sorted.sort((a, b) => new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime());
      return sorted;
  }
}

/**
 * Client-side search + filter + sort bar for `/github-projects`
 * ("GitHub Projects"), driven by the `GET /github-projects` list
 * (`lib/github-projects/api.ts`) — narrowed and re-ordered here, then
 * paginated 12-per-page (`GITHUB_PROJECTS_PAGE_SIZE`), never a second
 * fabricated data source (Frontend_Development_Rules.txt rule 58). Same
 * convention as `IssuesExplorer` and `AdminProjectsExplorer`: filtered,
 * sorted and paginated entirely in the browser.
 *
 * The server ships only the first page (the most-starred rows) so the
 * page paints without waiting on the whole catalog; `catalogLoad` turns
 * on a "Load all" button (`LoadCatalogBar`) that fetches the rest from
 * the browser, after which every filter/sort below covers the complete
 * list. Until then the bar says the search only covers what's loaded.
 *
 * Three filters, matching what a contributor exploring GitHub
 * repositories actually reaches for: **Tech stack** (built from the
 * tags the fetched projects actually carry — never a hardcoded catalog,
 * so the dropdown can't offer an option nothing here could match),
 * **Minimum stars** (a real threshold on the real `stars` field, not a
 * cosmetic label), and **Sort by** (Trending / Most stars / Newest /
 * Recently updated — see `sortProjects`'s doc comment on "Trending").
 */
export function GithubProjectsExplorer({
  projects: initialProjects,
  catalogFilter,
  catalogLoad,
  cardBasePath = "/github-projects",
}: {
  /**
   * The server-rendered first page of the catalog. When `catalogLoad` is
   * given and `hasMore` is true, this is only a preview — the rows the
   * explorer actually searches, filters and pages over are
   * `useLoadFullCatalog`'s `projects`, which start as this and become the
   * whole catalog after "Load all".
   */
  projects: GithubProjectSummary[];
  /**
   * Optional server-driven catalog filter — e.g. "Alternative to paid
   * software" on `/github-open-source-tools`
   * (`app/(public)/github-open-source-tools/page.tsx`). Deliberately
   * NOT handled like the Tech stack/Minimum stars filters below: those
   * narrow the `projects` array this component already has in memory,
   * but a catalog filter selects a *different backend discovery query*
   * (`lib/githubCatalog.ts`'s `CatalogRouteConfig.filters`
   * backend-side) — a different population of repositories entirely,
   * which only the server can fetch. So instead of filtering in place,
   * selecting an option here navigates to a new `?<paramName>=` URL and
   * lets the page's Server Component re-fetch and pass down a new
   * `projects` array. Omitted entirely on `/github-projects`, which has
   * no named filters to offer.
   */
  catalogFilter?: CatalogFilterConfig;
  /**
   * Enables the "Load all" bar above the grid. Omit it and `projects`
   * is treated as already complete, exactly as before.
   */
  catalogLoad?: CatalogLoadConfig;
  /**
   * Forwarded straight to `GithubProjectCard` — lets a page reusing this
   * explorer (like `/github-open-source-tools`) send every card's click
   * target to its own `:slug` detail route instead of
   * `/github-projects/:slug`.
   */
  cardBasePath?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [techStack, setTechStack] = useState(ALL_TECH);
  const [minStars, setMinStars] = useState(ALL_STARS);
  const [sortBy, setSortBy] = useState<SortOption>("TRENDING");

  const loader = useLoadFullCatalog({
    path: catalogLoad?.path ?? null,
    filter: catalogLoad?.filter,
    initialProjects,
    hasMore: catalogLoad?.hasMore ?? false,
  });
  const projects = loader.projects;

  function handleCatalogFilterChange(nextValue: string) {
    if (!catalogFilter) return;
    const params = new URLSearchParams(searchParams.toString());
    if (nextValue === NO_CATALOG_FILTER) {
      params.delete(catalogFilter.paramName);
    } else {
      params.set(catalogFilter.paramName, nextValue);
    }
    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  }

  const techStackOptions = useMemo(() => {
    const values = new Set<string>();
    for (const project of projects) {
      for (const value of project.techStack) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const minStarsThreshold = minStars === ALL_STARS ? 0 : Number(minStars);

    const filtered = projects.filter((project) => {
      if (techStack !== ALL_TECH && !project.techStack.includes(techStack)) return false;
      if (project.stars < minStarsThreshold) return false;

      if (!normalizedQuery) return true;

      const haystack = [
        project.name,
        project.repositoryFullName,
        project.description ?? "",
        project.primaryLanguage ?? "",
        project.owner.username,
        project.owner.name ?? "",
        ...project.techStack,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    return sortProjects(filtered, sortBy);
  }, [projects, query, techStack, minStars, sortBy]);

  const hasActiveFilters =
    query.trim().length > 0 || techStack !== ALL_TECH || minStars !== ALL_STARS;

  const paged = usePagePagination(filteredProjects, GITHUB_PROJECTS_PAGE_SIZE);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="github-projects-search" className="sr-only">
            Search GitHub projects by name, description, owner, or tech stack
          </label>

          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />

          <input
            id="github-projects-search"
            name="github-projects-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by project, description, owner, or tech stack"
            className="w-full rounded-[8px] border border-border bg-surface py-2 pl-8 pr-3 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {catalogFilter ? (
            <div className="flex flex-col gap-1">
              <label
                htmlFor="github-projects-catalog-filter"
                className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
              >
                Show
              </label>
              <FilterSelect
                id="github-projects-catalog-filter"
                value={catalogFilter.value}
                onChange={handleCatalogFilterChange}
                options={catalogFilter.options}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <label
              htmlFor="github-projects-techstack"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Tech stack
            </label>
            <FilterSelect
              id="github-projects-techstack"
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
              htmlFor="github-projects-stars"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Minimum stars
            </label>
            <FilterSelect
              id="github-projects-stars"
              value={minStars}
              onChange={setMinStars}
              options={STARS_FILTERS}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="github-projects-sort"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Sort by
            </label>
            <FilterSelect
              id="github-projects-sort"
              value={sortBy}
              onChange={(value) => setSortBy(value as SortOption)}
              options={SORT_FILTERS}
            />
          </div>
        </div>
      </div>

      {catalogLoad ? <LoadCatalogBar loader={loader} noun={catalogLoad.noun} /> : null}

      {filteredProjects.length === 0 ? (
        <SectionMessage>
          {hasActiveFilters
            ? "No GitHub projects match your search or the selected filters. Try different search terms or filters."
            : "No GitHub projects have been added yet — check back soon."}
        </SectionMessage>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {paged.pageItems.map((project) => (
              <GithubProjectCard key={project.id} project={project} basePath={cardBasePath} />
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