"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { FilterSelect } from "@/components/ui/filter-select";
import { AdminOpenSourceToolsGrid } from "./admin-opensource-tools-grid";
import type { AdminToolSummary } from "@/lib/admin/opensource-tools/types";

const ALL_LANGUAGES = "ALL";
const ALL_LABELS = "ALL";

/**
 * Every distinct `primaryLanguage` actually present across `tools`,
 * sorted — the same "never offer a filter option nothing on this page
 * could match" rule `AdminProjectsExplorer`'s tech-stack dropdown
 * follows (Frontend_Development_Rules.txt rule 58).
 */
function collectLanguageOptions(tools: AdminToolSummary[]): string[] {
  const values = new Set<string>();
  for (const tool of tools) {
    if (tool.primaryLanguage) values.add(tool.primaryLanguage);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

/** Every distinct label (Step 3 of onboarding — roles/fields) across `tools`, sorted. */
function collectLabelOptions(tools: AdminToolSummary[]): string[] {
  const values = new Set<string>();
  for (const tool of tools) {
    for (const label of tool.labels) values.add(label);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b));
}

/**
 * Client-side search + filter bar for `/admin/opensource-tools`. With
 * every tool already fetched server-side in one
 * `GET /admin/opensource-tools` call (`lib/admin/opensource-tools/api.ts`),
 * narrowing the list in the browser is a plain UX improvement, not a new
 * data source — nothing here fabricates a field the backend doesn't
 * already return (Frontend_Development_Rules.txt rule 58). Same split
 * `AdminProjectsExplorer` makes: this owns filter state, and hands the
 * filtered list to a plain presentational grid.
 *
 * Two filters, built only from fields recorded during tool onboarding
 * (`lib/admin/opensource-tool-onboarding/types.ts`) — the task asked for
 * filtering "based on the fields we ask during tool onboarding only":
 * - Primary language — Step 1's resolved `primaryLanguage`.
 * - Label — Step 3's free-form role/field tags.
 *
 * Both render via `FilterSelect` (components/ui/filter-select.tsx)
 * rather than a plain `<select>` — a native listbox popup always renders
 * with the OS/browser's own light styling regardless of the page's dark
 * theme, which looked visibly out of place here.
 *
 * Search matches name, source URL, fetched description, primary
 * language and labels — every field the grid card or its tooltip could
 * plausibly be searched by.
 *
 * This is authenticated Admin application UI (`noIndex: true` on the
 * page), not public content, so filtering client-side after a full
 * server fetch has no crawlability impact (rule 18).
 */
export function AdminOpenSourceToolsExplorer({ tools }: { tools: AdminToolSummary[] }) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<string>(ALL_LANGUAGES);
  const [label, setLabel] = useState<string>(ALL_LABELS);

  const languageOptions = useMemo(() => collectLanguageOptions(tools), [tools]);
  const labelOptions = useMemo(() => collectLabelOptions(tools), [tools]);

  const languageSelectOptions = useMemo(
    () => [
      { value: ALL_LANGUAGES, label: "All languages" },
      ...languageOptions.map((value) => ({ value, label: value })),
    ],
    [languageOptions],
  );

  const labelSelectOptions = useMemo(
    () => [
      { value: ALL_LABELS, label: "All labels" },
      ...labelOptions.map((value) => ({ value, label: value })),
    ],
    [labelOptions],
  );

  const filteredTools = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return tools.filter((tool) => {
      if (language !== ALL_LANGUAGES && tool.primaryLanguage !== language) {
        return false;
      }

      if (label !== ALL_LABELS && !tool.labels.includes(label)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        tool.name,
        tool.sourceUrl,
        tool.fetchedDescription ?? "",
        tool.primaryLanguage ?? "",
        ...tool.labels,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [tools, query, language, label]);

  const hasActiveFilters =
    query.trim().length > 0 || language !== ALL_LANGUAGES || label !== ALL_LABELS;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="admin-opensource-tools-search" className="sr-only">
            Search open source tools by name, URL, description, language or label
          </label>
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
          <input
            id="admin-opensource-tools-search"
            name="admin-opensource-tools-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, URL, language or label"
            className="w-full rounded-[8px] border border-border bg-surface py-2 pl-8 pr-3 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="admin-opensource-tools-language"
              className="whitespace-nowrap text-[11.5px] font-medium text-text-faint"
            >
              Language
            </label>
            <FilterSelect
              id="admin-opensource-tools-language"
              value={language}
              onChange={setLanguage}
              options={languageSelectOptions}
            />
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="admin-opensource-tools-label"
              className="whitespace-nowrap text-[11.5px] font-medium text-text-faint"
            >
              Label
            </label>
            <FilterSelect
              id="admin-opensource-tools-label"
              value={label}
              onChange={setLabel}
              options={labelSelectOptions}
            />
          </div>
        </div>
      </div>

      <p className="mb-3 text-[11.5px] text-text-faint" aria-live="polite">
        Showing {filteredTools.length} of {tools.length} tool
        {tools.length === 1 ? "" : "s"}
      </p>

      {filteredTools.length === 0 ? (
        <SectionMessage>
          {hasActiveFilters
            ? "No tools match your filters. Try a different search term, language, or label."
            : "No open source tools have been added yet."}
        </SectionMessage>
      ) : (
        <AdminOpenSourceToolsGrid tools={filteredTools} />
      )}
    </div>
  );
}
