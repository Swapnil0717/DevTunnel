"use client";

import { useMemo, useState, useTransition } from "react";
import { approveAiDiscoveredItem, rejectAiDiscoveredItem } from "@/lib/admin/ai-discovery/client-api";
import { Spinner } from "@/components/ui/spinner";
import { FilterSelect } from "@/components/ui/filter-select";
import { SearchIcon } from "@/components/layout/nav-icons";

type Kind = "projects" | "tools" | "tasks";

interface ItemFilter {
  /** Field name the filter dropdown is grouped and labeled by, e.g. "Category", "Difficulty", "Language". */
  field: string;
  value: string;
}

interface Item {
  id: string;
  title: string;
  subtitle: string;
  meta: string[];
  /** Structured, per-field values this item can be filtered by — distinct from `meta`, which is just display chips. */
  filters?: ItemFilter[];
  reasoning: string;
  details?: string[];
  url: string;
}

/**
 * Review queue for one kind (projects/tools/tasks) on the Confirmation by
 * Admin page. This page is the final review-and-submit step — discovery
 * itself is triggered from each kind's own admin page
 * (AiDiscoveryRunButton on /admin/ai/{projects,tools,tasks}) — so this
 * component's job is narrowing a queue that can grow long and then
 * confirming items either one at a time or all together.
 *
 * Filtering is client-side over the already-fetched queue (this is
 * authenticated admin tooling, not indexed content, so there's no
 * crawlability cost): a free-text search across title/subtitle, plus one
 * `FilterSelect` per distinct `filters[].field` the items actually carry,
 * with its options derived from the data rather than hardcoded — a
 * project queue gets Category/Difficulty/Language selects, a task queue
 * gets Project/Difficulty/Label/Role, etc.
 *
 * "Confirm all" approves every item currently passing the filters (not
 * the whole unfiltered queue) — so narrowing down to e.g. one category
 * and confirming all is exactly "confirm all of these", not everything.
 * There's no bulk endpoint on the backend, so this fires the same
 * per-item POST /admin/ai/{kind}/:id/approve as the individual "Confirm"
 * button, just in parallel across the visible set, and reports how many
 * succeeded/failed at the end.
 */
export function AiDiscoveryQueue({ kind, items }: { kind: Kind; items: Item[] }) {
  const [localItems, setLocalItems] = useState(items);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "reject" | null>(null);
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});

  const [isConfirmingAll, setIsConfirmingAll] = useState(false);
  const [confirmAllError, setConfirmAllError] = useState<string | null>(null);

  const filterGroups = useMemo(() => {
    const groups = new Map<string, Set<string>>();
    for (const item of localItems) {
      for (const f of item.filters ?? []) {
        if (!groups.has(f.field)) groups.set(f.field, new Set());
        groups.get(f.field)!.add(f.value);
      }
    }
    return Array.from(groups.entries()).map(([field, values]) => ({
      field,
      values: Array.from(values).sort((a, b) => a.localeCompare(b)),
    }));
  }, [localItems]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();

    return localItems.filter((item) => {
      for (const [field, selected] of Object.entries(selectedFilters)) {
        if (selected === "ALL" || !selected) continue;
        const matchesField = (item.filters ?? []).some((f) => f.field === field && f.value === selected);
        if (!matchesField) return false;
      }

      if (!normalizedQuery) return true;
      const haystack = [item.title, item.subtitle, ...item.meta].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [localItems, search, selectedFilters]);

  const hasActiveFilters = search.trim() !== "" || Object.values(selectedFilters).some((v) => v && v !== "ALL");

  function handle(id: string, action: "approve" | "reject") {
    setPendingId(id);
    setPendingAction(action);
    startTransition(async () => {
      try {
        if (action === "approve") await approveAiDiscoveredItem(kind, id);
        else await rejectAiDiscoveredItem(kind, id);
        setLocalItems((prev) => prev.filter((i) => i.id !== id));
      } finally {
        setPendingId(null);
        setPendingAction(null);
      }
    });
  }

  async function handleConfirmAll() {
    if (filteredItems.length === 0) return;
    const confirmed = window.confirm(
      `Confirm all ${filteredItems.length} ${hasActiveFilters ? "filtered " : ""}item${filteredItems.length === 1 ? "" : "s"} shown below?`,
    );
    if (!confirmed) return;

    setConfirmAllError(null);
    setIsConfirmingAll(true);
    try {
      const targetIds = filteredItems.map((i) => i.id);
      const results = await Promise.allSettled(
        targetIds.map(async (id) => {
          await approveAiDiscoveredItem(kind, id);
          return id;
        }),
      );
      const succeededIds = new Set(
        results.filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled").map((r) => r.value),
      );
      const failedCount = results.length - succeededIds.size;

      setLocalItems((prev) => prev.filter((i) => !succeededIds.has(i.id)));
      if (failedCount > 0) {
        setConfirmAllError(
          `${failedCount} of ${targetIds.length} item${targetIds.length === 1 ? "" : "s"} couldn't be confirmed. Try again for those.`,
        );
      }
    } finally {
      setIsConfirmingAll(false);
    }
  }

  if (localItems.length === 0) {
    return <p className="text-sm text-text-muted">Nothing left to review here.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface/40 p-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative w-full sm:w-64">
              <label htmlFor={`ai-queue-search-${kind}`} className="sr-only">
                Search {kind}
              </label>
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
              <input
                id={`ai-queue-search-${kind}`}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search"
                className="w-full rounded-[8px] border border-border bg-surface py-2 pl-8 pr-3 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>

            {filterGroups.map(({ field, values }) => (
              <div key={field} className="flex flex-col gap-1">
                <label
                  htmlFor={`ai-queue-filter-${kind}-${field}`}
                  className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
                >
                  {field}
                </label>
                <FilterSelect
                  id={`ai-queue-filter-${kind}-${field}`}
                  value={selectedFilters[field] ?? "ALL"}
                  onChange={(value) => setSelectedFilters((prev) => ({ ...prev, [field]: value }))}
                  options={[
                    { value: "ALL", label: `All ${field.toLowerCase()}s` },
                    ...values.map((v) => ({ value: v, label: v })),
                  ]}
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleConfirmAll}
            disabled={isConfirmingAll || filteredItems.length === 0}
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-green-600 px-3.5 py-2 text-[12.5px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConfirmingAll ? <Spinner size={13} /> : null}
            {isConfirmingAll ? "Confirming…" : `Confirm all (${filteredItems.length})`}
          </button>
        </div>

        <p className="m-0 text-[11.5px] text-text-faint" aria-live="polite">
          Showing {filteredItems.length} of {localItems.length} {kind}
        </p>
        {confirmAllError ? <p className="m-0 text-[12px] text-status-error-label">{confirmAllError}</p> : null}
      </div>

      {filteredItems.length === 0 ? (
        <p className="text-sm text-text-muted">No {kind} match your search or the selected filters.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {filteredItems.map((item) => (
            <li key={item.id} className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <a href={item.url} target="_blank" rel="noreferrer" className="font-medium text-text hover:underline">
                    {item.title}
                  </a>
                  <p className="mt-0.5 text-sm text-text-muted">{item.subtitle}</p>
                  {item.meta.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-2 text-xs text-text-muted">
                      {item.meta.map((m) => (
                        <span key={m} className="rounded bg-surface-muted px-1.5 py-0.5">
                          {m}
                        </span>
                      ))}
                    </p>
                  )}
                  {item.details && item.details.length > 0 && (
                    <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm text-text-muted">
                      {item.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-2 text-sm italic text-text-muted">{item.reasoning}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={isConfirmingAll || (isPending && pendingId === item.id)}
                    onClick={() => handle(item.id, "approve")}
                    className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {isPending && pendingId === item.id && pendingAction === "approve" ? <Spinner size={13} /> : null}
                    Confirm
                  </button>
                  <button
                    type="button"
                    disabled={isConfirmingAll || (isPending && pendingId === item.id)}
                    onClick={() => handle(item.id, "reject")}
                    className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text disabled:opacity-50"
                  >
                    {isPending && pendingId === item.id && pendingAction === "reject" ? <Spinner size={13} /> : null}
                    Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}