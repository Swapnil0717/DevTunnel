"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Fixed page size every Admin list view (Projects, Tasks, Open Source
 * Tools, New Issues, Issues Since Onboarding) paginates by, so every
 * table shows the same "20 per page" regardless of how it's styled.
 */
export const ADMIN_PAGE_SIZE = 20;

export interface PagedList<T> {
  /** 1-indexed current page. */
  page: number;
  setPage: (page: number) => void;
  /** Always at least 1, even for an empty list. */
  totalPages: number;
  /** The slice of `items` belonging to the current page. */
  pageItems: T[];
  /** 1-indexed position of the first item on the current page (0 when the list is empty). */
  rangeStart: number;
  /** 1-indexed position of the last item on the current page. */
  rangeEnd: number;
  totalItems: number;
}

/**
 * Client-side, page-number pagination over an already-filtered array.
 * Every Admin Explorer already fetches its full list once and narrows
 * it in the browser (search + dropdown filters) — paginating that same
 * in-memory array is the natural next slice rather than a second server
 * round-trip.
 *
 * Resets back to page 1 whenever `items` itself changes. For every
 * caller here `items` is the *filtered* array, built with `useMemo` off
 * the search/filter state — so its reference only changes when a filter
 * actually narrows/widens the results, never when only the page number
 * changes. That means switching pages never gets fought by this reset,
 * but picking a new filter always lands back on page 1 instead of
 * possibly pointing past the end of a much shorter result set.
 */
export function usePagePagination<T>(
  items: T[],
  pageSize: number = ADMIN_PAGE_SIZE,
): PagedList<T> {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  const rangeStart = items.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const rangeEnd = Math.min(safePage * pageSize, items.length);

  return {
    page: safePage,
    setPage,
    totalPages,
    pageItems,
    rangeStart,
    rangeEnd,
    totalItems: items.length,
  };
}