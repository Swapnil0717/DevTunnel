"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { AdminProjectsTable } from "./admin-projects-table";
import type { AdminProjectStatus, AdminProjectSummary } from "@/lib/admin/projects/types";

type StatusFilter = "ALL" | AdminProjectStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "ARCHIVED", label: "Archived" },
];

/**
 * Client-side filter bar for `/admin/projects` (admin_workflow.txt,
 * section 4 — Projects Page: "Show all projects currently available on
 * DevTunnel"). The spec doesn't call out filtering explicitly, but with
 * every project already fetched server-side in one `GET /admin/projects`
 * call (`lib/admin/projects/api.ts`), narrowing that list in the browser
 * is a plain UX improvement — not a new data source, so nothing here
 * fabricates fields the backend doesn't already return
 * (Frontend_Development_Rules.txt rule 58).
 *
 * Two filters, matching the columns the table already renders
 * (`AdminProjectsTable`, section 4 ▸ Frontend):
 * - Search — matches project name, GitHub repository, and author
 *   (username or display name).
 * - Status — matches the exact `AdminProjectStatus` values the table's
 *   status badge already recognizes (`AdminProjectStatusBadge`), so a
 *   filter option is never offered for a status the UI can't otherwise
 *   display.
 *
 * Kept as a small client component wrapping the existing, still
 * server-rendered-by-default `AdminProjectsTable` rather than folding
 * filter state into the table itself, so the table stays a plain
 * presentational component driven entirely by its `projects` prop.
 *
 * This is authenticated Admin application UI (`noIndex: true` on the
 * page), not public content, so filtering client-side after a full
 * server fetch has no crawlability impact
 * (Frontend_Development_Rules.txt rule 18).
 */
export function AdminProjectsExplorer({
  projects,
}: {
  projects: AdminProjectSummary[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return projects.filter((project) => {
      if (status !== "ALL" && project.status !== status) {
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
  }, [projects, query, status]);

  const hasActiveFilters = query.trim().length > 0 || status !== "ALL";

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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

        <div className="flex items-center gap-2">
          <label
            htmlFor="admin-projects-status"
            className="whitespace-nowrap text-[11.5px] font-medium text-text-faint"
          >
            Status
          </label>
          <select
            id="admin-projects-status"
            name="admin-projects-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="rounded-[8px] border border-border bg-surface px-2.5 py-2 text-[12.5px] text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mb-3 text-[11.5px] text-text-faint" aria-live="polite">
        Showing {filteredProjects.length} of {projects.length} project
        {projects.length === 1 ? "" : "s"}
      </p>

      {filteredProjects.length === 0 ? (
        <SectionMessage>
          {hasActiveFilters
            ? "No projects match your search or the selected status. Try a different search term or status."
            : "No projects have been onboarded yet."}
        </SectionMessage>
      ) : (
        <AdminProjectsTable projects={filteredProjects} />
      )}
    </div>
  );
}