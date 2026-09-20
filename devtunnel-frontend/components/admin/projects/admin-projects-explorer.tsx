"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { FilterSelect } from "@/components/ui/filter-select";
import { PagePaginationControls } from "@/components/admin/page-pagination-controls";
import { usePagePagination } from "@/lib/admin/use-page-pagination";
import { AdminProjectsTable } from "./admin-projects-table";
import type { AdminProjectStatus, AdminProjectSummary } from "@/lib/admin/projects/types";

type StatusFilter = "ALL" | AdminProjectStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
];

const ALL_AUTHORS = "ALL";
const ALL_TECH = "ALL";

/**
 * Every tech-stack category `OnboardingTechStack` carries, flattened into
 * one list of distinct values for a single "Tech stack" dropdown — a
 * project matches the filter if the selected value appears in ANY of its
 * categories (languages, frontend, backend, frameworks, databases,
 * libraries, buildTools). Only built from values projects actually have
 * (`AdminProjectSummary.techStack`) — never a hardcoded catalog, so the
 * dropdown can't offer an option nothing on this page could ever match
 * (Frontend_Development_Rules.txt rule 58).
 */
function collectTechStackOptions(projects: AdminProjectSummary[]): string[] {
  const values = new Set<string>();

  for (const project of projects) {
    const stack = project.techStack;
    if (!stack) continue;

    for (const value of [
      ...stack.languages,
      ...stack.frontend,
      ...stack.backend,
      ...stack.frameworks,
      ...stack.databases,
      ...stack.libraries,
      ...stack.buildTools,
    ]) {
      values.add(value);
    }
  }

  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

function projectMatchesTech(project: AdminProjectSummary, tech: string): boolean {
  const stack = project.techStack;
  if (!stack) return false;

  return (
    stack.languages.includes(tech) ||
    stack.frontend.includes(tech) ||
    stack.backend.includes(tech) ||
    stack.frameworks.includes(tech) ||
    stack.databases.includes(tech) ||
    stack.libraries.includes(tech) ||
    stack.buildTools.includes(tech)
  );
}

/**
 * Client-side filter bar for `/admin/projects` (admin_workflow.txt,
 * section 4 — Projects Page: "Show all projects currently available on
 * DevTunnel"). The full project list is fetched server-side
 * (`lib/admin/projects/api.ts`), narrowed here by search/author/tech
 * stack/status, then paginated 20-per-page (`usePagePagination`) with
 * numbered "Page 1 of N" controls (`PagePaginationControls`) — never a
 * new data source, just a browser-side view over one real fetch
 * (Frontend_Development_Rules.txt rule 58).
 */
export function AdminProjectsExplorer({
  projects,
}: {
  projects: AdminProjectSummary[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [author, setAuthor] = useState<string>(ALL_AUTHORS);
  const [tech, setTech] = useState<string>(ALL_TECH);

  const authorOptions = useMemo(() => {
    const byUsername = new Map<string, string>();
    for (const project of projects) {
      if (!byUsername.has(project.author.username)) {
        byUsername.set(project.author.username, project.author.name ?? project.author.username);
      }
    }
    return Array.from(byUsername.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [projects]);

  const techOptions = useMemo(() => collectTechStackOptions(projects), [projects]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return projects.filter((project) => {
      if (status !== "ALL" && project.status !== status) {
        return false;
      }

      if (author !== ALL_AUTHORS && project.author.username !== author) {
        return false;
      }

      if (tech !== ALL_TECH && !projectMatchesTech(project, tech)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        project.name,
        project.repositoryFullName,
        project.author.username,
        project.author.name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [projects, query, status, author, tech]);

  const hasActiveFilters =
    query.trim().length > 0 || status !== "ALL" || author !== ALL_AUTHORS || tech !== ALL_TECH;

  const paged = usePagePagination(filteredProjects);

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="admin-projects-search" className="sr-only">
            Search projects by name, repository or author
          </label>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
          <input
            id="admin-projects-search"
            name="admin-projects-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by project, repository or author"
            className="w-full rounded-[8px] border border-border bg-surface py-2 pl-8 pr-3 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="admin-projects-author"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Author
            </label>
            <FilterSelect
              id="admin-projects-author"
              value={author}
              onChange={setAuthor}
              options={[
                { value: ALL_AUTHORS, label: "All authors" },
                ...authorOptions.map(([username, displayName]) => ({
                  value: username,
                  label: `${displayName} (@${username})`,
                })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="admin-projects-tech"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Tech stack
            </label>
            <FilterSelect
              id="admin-projects-tech"
              value={tech}
              onChange={setTech}
              options={[
                { value: ALL_TECH, label: "All tech stacks" },
                ...techOptions.map((value) => ({ value, label: value })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="admin-projects-status"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Status
            </label>
            <FilterSelect
              id="admin-projects-status"
              value={status}
              onChange={(value) => setStatus(value as StatusFilter)}
              options={STATUS_FILTERS}
            />
          </div>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <SectionMessage>
          {hasActiveFilters
            ? "No projects match your filters. Try a different search term, author, tech stack, or status."
            : "No projects have been onboarded yet."}
        </SectionMessage>
      ) : (
        <>
          <AdminProjectsTable projects={paged.pageItems} />
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