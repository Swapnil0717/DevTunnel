// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";

/**
 * How many rows the server-rendered first paint of a GitHub catalog page
 * (`/github-projects`, `/github-open-source-tools`) asks for. The backend
 * serves catalogs ranked by stars, so this is "the most-starred N" —
 * five 12-card grid pages' worth, enough to browse right away without the
 * page waiting on a walk of the entire catalog. The rest arrives when the
 * contributor presses "Load all" (`useLoadFullCatalog`).
 */
export const CATALOG_PREVIEW_LIMIT = 60;

export type CatalogPreviewResult<T> =
  | { status: "ok"; data: T[]; hasMore: boolean }
  | { status: "empty" }
  | { status: "error" };

/**
 * Fetches just the first page of a keyset-paginated catalog list route
 * (`limit`/`before` query params, `X-Next-Cursor` response header) —
 * the counterpart to `fetchAllAdminPages`, which walks every page.
 *
 * `hasMore` is read from the presence of `X-Next-Cursor`: the backend
 * only sets it when rows remain past this page. That header is readable
 * here because this runs server-side (Worker to API, no CORS in play) —
 * the browser-side loader can't rely on it, see `./catalog-client.ts`.
 *
 * `extraQuery` is forwarded as additional query params, e.g. the tools
 * catalog's `?filter=alternative-to-paid`.
 */
export async function fetchCatalogPreview<T>(
  path: string,
  limit: number = CATALOG_PREVIEW_LIMIT,
  extraQuery?: Record<string, string>,
): Promise<CatalogPreviewResult<T>> {
  try {
    const query = new URLSearchParams({ limit: String(limit) });
    if (extraQuery) {
      for (const [key, value] of Object.entries(extraQuery)) {
        query.set(key, value);
      }
    }

    const res = await fetch(`${API_BASE_URL}${path}?${query.toString()}`, {
      headers: { cookie: (await cookies()).toString() },
      cache: "no-store",
    });

    if (!res.ok) return { status: "error" };

    const data = (await res.json()) as T[];
    if (data.length === 0) return { status: "empty" };

    return { status: "ok", data, hasMore: res.headers.get("X-Next-Cursor") !== null };
  } catch {
    return { status: "error" };
  }
}
