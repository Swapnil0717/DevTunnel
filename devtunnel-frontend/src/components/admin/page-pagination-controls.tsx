"use client";

interface PagePaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  rangeStart: number;
  rangeEnd: number;
  totalItems: number;
  /** Singular noun for the "Showing X–Y of Z <label>(s)" line, e.g. "project", "task". */
  itemLabel: string;
}

/**
 * Builds a compact page-number window: always the first and last page,
 * the current page, and its immediate neighbors — with "…" filling any
 * gap — so a 40-page list doesn't render 40 buttons in a row.
 */
function buildPageWindow(page: number, totalPages: number): (number | "ellipsis")[] {
  const window = new Set<number>([1, totalPages, page]);
  if (page - 1 >= 1) window.add(page - 1);
  if (page + 1 <= totalPages) window.add(page + 1);

  const sorted = Array.from(window).sort((a, b) => a - b);
  const result: (number | "ellipsis")[] = [];
  let prev = 0;
  for (const value of sorted) {
    if (prev && value - prev > 1) result.push("ellipsis");
    result.push(value);
    prev = value;
  }
  return result;
}

/**
 * Numbered pagination footer shared by every Admin list Explorer
 * (Projects, Tasks, Open Source Tools, New Issues, Issues Since
 * Onboarding). Shows "Showing X–Y of Z <items> — page P of N" plus
 * Previous / numbered / Next controls, driven entirely by
 * `usePagePagination` — no URL query params, since these lists already
 * paginate a client-side-filtered array rather than a server page.
 */
export function PagePaginationControls({
  page,
  totalPages,
  onPageChange,
  rangeStart,
  rangeEnd,
  totalItems,
  itemLabel,
}: PagePaginationControlsProps) {
  if (totalItems === 0) return null;

  const pageWindow = buildPageWindow(page, totalPages);

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-col gap-3 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <p className="m-0 text-[11.5px] text-text-faint" aria-live="polite">
        Showing {rangeStart}–{rangeEnd} of {totalItems} {itemLabel}
        {totalItems === 1 ? "" : "s"} — page {page} of {totalPages}
      </p>

      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="inline-flex items-center rounded-[8px] border border-border bg-surface px-2.5 py-1.5 text-[12px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>

          {pageWindow.map((entry, index) =>
            entry === "ellipsis" ? (
              <span
                key={`ellipsis-${index}`}
                className="px-1.5 text-[12px] text-text-faint"
                aria-hidden="true"
              >
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => onPageChange(entry)}
                aria-current={entry === page ? "page" : undefined}
                className={`inline-flex min-w-[30px] items-center justify-center rounded-[8px] border px-2 py-1.5 text-[12px] font-medium transition-colors ${
                  entry === page
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-surface text-text hover:bg-surface-raised"
                }`}
              >
                {entry}
              </button>
            ),
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="inline-flex items-center rounded-[8px] border border-border bg-surface px-2.5 py-1.5 text-[12px] font-medium text-text transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      ) : null}
    </nav>
  );
}