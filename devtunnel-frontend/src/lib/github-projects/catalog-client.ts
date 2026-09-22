// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as `./client-api.ts` and
// `lib/issues/repo-issues-client.ts`. Kept out of the server-only
// `./api.ts` files, which read request cookies via `next/headers`.
import { API_BASE_URL } from "@/lib/config";
import type { GithubProjectSummary } from "./types";

/**
 * Rows per request — the most the catalog routes accept
 * (`catalogListQuerySchema` in devtunnel-backend `src/lib/githubCatalog.ts`).
 * A catalog holds at most a couple of thousand repositories, so a full
 * walk is a handful of calls.
 */
const CATALOG_PAGE_LIMIT = 500;

/** Safety ceiling — stops a misbehaving backend from looping this forever. */
const MAX_PAGES = 50;

export class CatalogLoadError extends Error {
  status: number;
  /** The backend's own `error.code` (devtunnel-backend `lib/response.ts`), when the body parsed. */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "CatalogLoadError";
    this.status = status;
    this.code = code;
  }
}

async function parseErrorBody(res: Response): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return { code: body.error?.code, message: body.error?.message };
  } catch {
    return {};
  }
}

/**
 * Loads a GitHub catalog's complete list (`GET /github-projects` or
 * `GET /github-open-source-tools`) from the browser — what the "Load all"
 * button on those pages calls after the server-rendered page shipped only
 * the first `CATALOG_PREVIEW_LIMIT` rows.
 *
 * Walks from the start rather than resuming after the preview, so the
 * result is one consistent list: if the backend's cache was refreshed
 * between the page render and this click, resuming at an offset could
 * skip or repeat rows. Rows are de-duplicated by `id` in case the cache
 * turns over mid-walk.
 *
 * The next page's cursor is computed (`before` is a plain numeric offset
 * into the cached catalog — see `handleCatalogListRequest`) instead of
 * read from `X-Next-Cursor`: the backend's CORS config doesn't list that
 * header in `Access-Control-Expose-Headers`, so a cross-origin browser
 * request (devtunnel.tech to api.devtunnel.tech) can't see it. A page
 * shorter than `CATALOG_PAGE_LIMIT` means the end was reached.
 *
 * `filter` is the tools catalog's optional `?filter=` value.
 *
 * Rejects with `CatalogLoadError` on any failure — its `message` is the
 * backend's own safe-to-show text where there is one — and rethrows the
 * browser's `AbortError` untouched so callers can tell "cancelled" from
 * "failed".
 */
export async function fetchFullCatalog(
  path: string,
  options: { filter?: string; signal?: AbortSignal } = {},
): Promise<GithubProjectSummary[]> {
  const { filter, signal } = options;
  const byId = new Map<string, GithubProjectSummary>();
  let offset = 0;

  for (let pages = 0; pages < MAX_PAGES; pages += 1) {
    const query = new URLSearchParams({ limit: String(CATALOG_PAGE_LIMIT) });
    if (offset > 0) query.set("before", String(offset));
    if (filter) query.set("filter", filter);

    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}${path}?${query.toString()}`, {
        credentials: "include",
        cache: "no-store",
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new CatalogLoadError(
        "Couldn't reach DevTunnel. Check your connection and try again.",
        0,
      );
    }

    if (!res.ok) {
      const { code, message } = await parseErrorBody(res);
      throw new CatalogLoadError(
        message ?? `Couldn't load the full list right now (${res.status}).`,
        res.status,
        code,
      );
    }

    const page = (await res.json().catch(() => null)) as GithubProjectSummary[] | null;
    if (!Array.isArray(page)) {
      throw new CatalogLoadError("Got an unexpected response while loading.", res.status);
    }

    for (const row of page) byId.set(row.id, row);

    if (page.length < CATALOG_PAGE_LIMIT) break;
    offset += page.length;
  }

  return Array.from(byId.values());
}

export interface CatalogRefreshResult {
  /** `"refreshed"` when a new scan actually ran; `"already-fresh"` when a very recent refresh made another one unnecessary. Either way the catalog behind `path` is current. */
  status: "refreshed" | "already-fresh";
  repositoryCount: number;
}

/**
 * The "Refresh" button's action (`POST {path}/refresh`,
 * devtunnel-backend `lib/githubCatalog.ts` `handleCatalogRefreshRequest`)
 * — re-scans this catalog against GitHub right now instead of waiting on
 * the scheduled warmer, so the button can reflect newly-trending or
 * newly-created repositories on demand.
 *
 * Does not itself return the refreshed rows — the backend scan result
 * isn't paginated the way `GET` responses are, and re-deriving that here
 * would duplicate `fetchFullCatalog`'s own pagination walk. Callers
 * should follow a successful refresh with `fetchFullCatalog` (or a
 * server-side re-fetch, e.g. `router.refresh()`) to pull the now-current
 * catalog.
 *
 * Rejects with `CatalogLoadError` on any failure, same conventions as
 * `fetchFullCatalog` — a `409` (`catalog_refresh_in_progress`, another
 * scan already running) and a `429` (rate limited) are both expected,
 * recoverable outcomes a caller should show as "try again shortly"
 * rather than a hard failure.
 */
export async function refreshCatalog(
  path: string,
  options: { filter?: string; signal?: AbortSignal } = {},
): Promise<CatalogRefreshResult> {
  const { filter, signal } = options;
  const query = new URLSearchParams();
  if (filter) query.set("filter", filter);
  const queryString = query.toString();

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}/refresh${queryString ? `?${queryString}` : ""}`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new CatalogLoadError(
      "Couldn't reach DevTunnel. Check your connection and try again.",
      0,
    );
  }

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new CatalogLoadError(
      message ?? `Couldn't refresh right now (${res.status}).`,
      res.status,
      code,
    );
  }

  const body = (await res.json().catch(() => null)) as CatalogRefreshResult | null;
  if (!body || (body.status !== "refreshed" && body.status !== "already-fresh")) {
    throw new CatalogLoadError("Got an unexpected response while refreshing.", res.status);
  }

  return body;
}
