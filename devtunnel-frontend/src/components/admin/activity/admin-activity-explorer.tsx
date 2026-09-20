"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { FilterSelect } from "@/components/ui/filter-select";
import { PagePaginationControls } from "@/components/admin/page-pagination-controls";
import { usePagePagination } from "@/lib/admin/use-page-pagination";
import { AdminActivityTable } from "./admin-activity-table";
import type { AdminAuditEntry, AdminAuditResult } from "@/lib/admin/activity/types";

type ResultFilter = "ALL" | AdminAuditResult;

const RESULT_FILTERS: { value: ResultFilter; label: string }[] = [
  { value: "ALL", label: "All results" },
  { value: "SUCCESS", label: "Success" },
  { value: "DENIED", label: "Denied" },
  { value: "FAILURE", label: "Failure" },
];

/**
 * Client-side search/filter bar for `/admin/activity`
 * (devtunnel_workflow.txt section 43), driven by one fully-fetched
 * `GET /admin/activity` log (`getAdminActivityLog`, which walks the
 * backend's keyset pagination in full). Matches the search + dropdown
 * filter + 20-per-page numbered pagination convention every other
 * Admin Explorer already uses (`AdminTasksExplorer`,
 * `AdminProjectsExplorer`).
 *
 * Filters by result (Success / Denied / Failure) and resource type,
 * plus a free-text search over action, resource type/id, and admin id
 * — the fields most likely to identify a specific event someone is
 * looking for in the log.
 */
export function AdminActivityExplorer({ entries }: { entries: AdminAuditEntry[] }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ResultFilter>("ALL");
  const [resourceType, setResourceType] = useState("ALL");

  const resourceTypeOptions = useMemo(() => {
    const values = new Set<string>();
    for (const entry of entries) values.add(entry.resourceType);
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return entries.filter((entry) => {
      if (result !== "ALL" && entry.result !== result) return false;
      if (resourceType !== "ALL" && entry.resourceType !== resourceType) return false;

      if (!normalizedQuery) return true;

      const haystack = [entry.action, entry.resourceType, entry.resourceId ?? "", entry.adminId]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [entries, query, result, resourceType]);

  const hasActiveFilters =
    query.trim().length > 0 || result !== "ALL" || resourceType !== "ALL";

  const paged = usePagePagination(filteredEntries);

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="admin-activity-search" className="sr-only">
            Search activity by action, resource, or admin
          </label>

          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />

          <input
            id="admin-activity-search"
            name="admin-activity-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by action, resource, or admin"
            className="w-full rounded-[8px] border border-border bg-surface py-2 pl-8 pr-3 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="admin-activity-result"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Result
            </label>
            <FilterSelect
              id="admin-activity-result"
              value={result}
              onChange={(value) => setResult(value as ResultFilter)}
              options={RESULT_FILTERS}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="admin-activity-resource"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Resource
            </label>
            <FilterSelect
              id="admin-activity-resource"
              value={resourceType}
              onChange={setResourceType}
              options={[
                { value: "ALL", label: "All resources" },
                ...resourceTypeOptions.map((value) => ({ value, label: value })),
              ]}
            />
          </div>
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <SectionMessage>
          {hasActiveFilters
            ? "No activity matches your search or the selected filters. Try different search terms or filters."
            : "No admin activity has been recorded yet."}
        </SectionMessage>
      ) : (
        <>
          <AdminActivityTable entries={paged.pageItems} />
          <PagePaginationControls
            page={paged.page}
            totalPages={paged.totalPages}
            onPageChange={paged.setPage}
            rangeStart={paged.rangeStart}
            rangeEnd={paged.rangeEnd}
            totalItems={paged.totalItems}
            itemLabel="entry"
          />
        </>
      )}
    </div>
  );
}