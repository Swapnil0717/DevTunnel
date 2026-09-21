// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as
// `lib/github-projects/catalog-client.ts` and
// `lib/issues/repo-issues-client.ts`. Kept out of `./api.ts`, which
// reads request cookies via `next/headers` and can only run in a Server
// Component.
import { API_BASE_URL } from "@/lib/config";
import type { Issue } from "./types";

/**
 * Rows per request — the most `GET /issues` accepts (`listQuerySchema`
 * in devtunnel-backend `src/routes/issues.ts`). Every call is served
 * from the backend's cached scan, so a large page costs the same as a
 * small one and a full walk stays a handful of calls.
 */
const ISSUES_PAGE_LIMIT = 1000;

/** Safety ceiling — stops a misbehaving backend from looping this forever. */
const MAX_PAGES = 50;

export class IssuesLoadError extends Error {
  status: number;
  /** The backend's own `error.code` (devtunnel-backend `lib/response.ts`), when the body parsed. */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "IssuesLoadError";
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

function issueKey(issue: Issue): string {
  return `${issue.project.slug}#${issue.number}`;
}

/**
 * Loads the complete open-issue list (`GET /issues`) from the browser —
 * what the "Load all issues" button on `/issues` calls after the
 * server-rendered page shipped only the first `ISSUES_PREVIEW_LIMIT`
 * rows.
 *
 * Walks from the start rather than resuming after the preview, so the
 * result is one consistent list: if the backend's cache refreshed
 * between the page render and this click, resuming from the preview's
 * last row could skip or repeat issues. Rows are de-duplicated by
 * project + issue number for the same reason.
 *
 * The next page's cursor is the last row's `updatedAt` (that is exactly
 * what the backend's `X-Next-Cursor` carries) computed here instead of
 * read from the header: the backend's CORS config doesn't list that
 * header in `Access-Control-Expose-Headers`, so a cross-origin browser
 * request (devtunnel.tech to api.devtunnel.tech) can't see it. A page
 * shorter than `ISSUES_PAGE_LIMIT` means the end was reached, and a
 * cursor that fails to advance ends the walk rather than looping.
 *
 * Rejects with `IssuesLoadError` on any failure — its `message` is the
 * backend's own safe-to-show text where there is one — and rethrows the
 * browser's `AbortError` untouched so callers can tell "cancelled" from
 * "failed".
 */
export async function fetchAllIssues(signal?: AbortSignal): Promise<Issue[]> {
  const byKey = new Map<string, Issue>();
  let before: string | null = null;

  for (let pages = 0; pages < MAX_PAGES; pages += 1) {
    const query = new URLSearchParams({ limit: String(ISSUES_PAGE_LIMIT) });
    if (before) query.set("before", before);

    let res: Response;
    try {
      res = await fetch(`${API_BASE_URL}/issues?${query.toString()}`, {
        credentials: "include",
        cache: "no-store",
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      throw new IssuesLoadError(
        "Couldn't reach DevTunnel. Check your connection and try again.",
        0,
      );
    }

    if (!res.ok) {
      const { code, message } = await parseErrorBody(res);
      throw new IssuesLoadError(
        message ?? `Couldn't load the full list right now (${res.status}).`,
        res.status,
        code,
      );
    }

    const page = (await res.json().catch(() => null)) as Issue[] | null;
    if (!Array.isArray(page)) {
      throw new IssuesLoadError("Got an unexpected response while loading.", res.status);
    }

    for (const issue of page) byKey.set(issueKey(issue), issue);

    if (page.length < ISSUES_PAGE_LIMIT) break;

    const last: Issue | undefined = page[page.length - 1];
    if (!last || last.updatedAt === before) break;
    before = last.updatedAt;
  }

  return Array.from(byKey.values());
}
