// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";

/**
 * Every Admin list endpoint (`GET /admin/projects`, `/admin/tasks`,
 * `/admin/opensource-tools`, `/admin/new-issues`) accepts up to 100 rows
 * per page (`listQuerySchema` on each route) — the widest page size, so
 * walking the full list takes the fewest round trips.
 */
const MAX_PAGE_LIMIT = 100;

/**
 * Safety ceiling on how many pages one request will ever walk — 200
 * pages * 100/page = 20,000 rows, comfortably above any real admin
 * dataset today. Stops rather than looping forever if a backend bug
 * ever made `X-Next-Cursor` repeat itself.
 */
const MAX_PAGES = 200;

export type FetchAllPagesResult<T> =
  | { status: "ok"; data: T[] }
  | { status: "empty" }
  | { status: "error" };

/**
 * Walks every page of a keyset-paginated `GET /admin/...` list endpoint
 * (`limit`/`before` query params, `X-Next-Cursor` response header — see
 * `lib/admin/cursor-pagination.ts`) and returns the full, concatenated
 * result.
 *
 * Every Admin Explorer component already does its search/filtering
 * client-side over one in-memory array (`AdminProjectsExplorer`,
 * `AdminTasksExplorer`, etc.) — this is what lets them page through the
 * *complete* list 20-at-a-time with real "Page 1 of N" controls
 * (`PagePaginationControls`), instead of only ever being able to show
 * whatever the first backend page happened to contain.
 *
 * If a later page's fetch fails after earlier pages already succeeded,
 * this returns what was gathered so far rather than discarding it —
 * one transient failure partway through a walk shouldn't blank out data
 * already in hand (same "don't let one failure void real work" posture
 * the backend's own `Promise.allSettled` project scans take).
 */
export async function fetchAllAdminPages<T>(path: string): Promise<FetchAllPagesResult<T>> {
  try {
    const items: T[] = [];
    let before: string | undefined;
    let pages = 0;

    do {
      const query = new URLSearchParams({ limit: String(MAX_PAGE_LIMIT) });
      if (before) query.set("before", before);

      const res = await fetch(`${API_BASE_URL}${path}?${query.toString()}`, {
        headers: { cookie: cookies().toString() },
        cache: "no-store",
      });

      if (!res.ok) {
        return items.length > 0 ? { status: "ok", data: items } : { status: "error" };
      }

      const page = (await res.json()) as T[];
      items.push(...page);

      before = res.headers.get("X-Next-Cursor") ?? undefined;
      pages += 1;
    } while (before && pages < MAX_PAGES);

    if (items.length === 0) return { status: "empty" };
    return { status: "ok", data: items };
  } catch {
    return { status: "error" };
  }
}