// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { Issue } from "./types";

/**
 * `GET /issues` — the contributor-facing counterpart to the Admin
 * Portal's `GET /admin/new-issues` (`lib/admin/new-issues/api.ts`):
 * open GitHub issues across DevTunnel's onboarded projects, so a
 * contributor can browse and pick one to work on from `/issues`
 * ("All Issues" in `AppSidebar` / `AppBottomNav`).
 *
 * Confirmed against the backend (devtunnel-backend `src/routes/issues.ts`):
 * signed-in only, sorted newest-updated-first, keyset-paginated
 * (`limit` / `before` query params, `X-Next-Cursor` response header),
 * and served from a KV-cached cross-project GitHub scan.
 *
 * Returns only the first page (`ISSUES_PREVIEW_LIMIT` rows — the most
 * recently updated) plus `hasMore`, not the whole list. This page used
 * to walk *every* page of `GET /issues` before it rendered anything, so
 * the whole page waited on the largest possible read — and one slow or
 * failed request anywhere in that walk blanked the page. It now follows
 * the same shape the GitHub catalog pages already use
 * (`lib/github-projects/fetch-catalog-preview.ts`): render a useful
 * first page immediately and let a "Load all issues" button
 * (`lib/issues/client-api.ts`) fetch the remainder from the browser.
 *
 * Failures are never silent: the result carries a `reason` (so the page
 * can say what actually went wrong — signed out, route not deployed,
 * rate limited, backend error, unreachable) and every failure is logged
 * with the HTTP status and the backend's request id, which is what
 * shows up in `wrangler tail` for the frontend Worker.
 */

/**
 * How many issues the server-rendered first paint asks for. The list is
 * newest-updated-first, so this is "the 200 most recently updated open
 * issues" — twenty pages of the 10-per-page table, and plenty of rows for
 * the Repository / Author / Tech stack / Project filters to be useful
 * before anyone presses "Load all issues".
 */
export const ISSUES_PREVIEW_LIMIT = 200;

/** How many times a transient failure (network error, 502/503/504) is retried. */
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 400;

export type IssuesFailureReason =
  | "signed-out"
  | "not-found"
  | "rate-limited"
  | "server-error"
  | "unreachable";

export type IssuesResult =
  | { status: "ok"; data: Issue[]; hasMore: boolean }
  | { status: "empty" }
  | { status: "error"; reason: IssuesFailureReason };

function reasonForStatus(status: number): IssuesFailureReason {
  if (status === 401 || status === 403) return "signed-out";
  if (status === 404) return "not-found";
  if (status === 429) return "rate-limited";
  return "server-error";
}

function isTransient(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readBackendErrorCode(res: Response): Promise<string | undefined> {
  try {
    const body = (await res.json()) as { error?: { code?: string } };
    return body.error?.code;
  } catch {
    return undefined;
  }
}

export async function getIssues(): Promise<IssuesResult> {
  const query = new URLSearchParams({ limit: String(ISSUES_PREVIEW_LIMIT) });
  const url = `${API_BASE_URL}/issues?${query.toString()}`;

  let cookieHeader = "";
  try {
    cookieHeader = (await cookies()).toString();
  } catch (err) {
    console.error("[issues] could not read request cookies", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: "error", reason: "unreachable" };
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const isLastAttempt = attempt === MAX_RETRIES;

    try {
      const res = await fetch(url, {
        headers: { cookie: cookieHeader },
        cache: "no-store",
      });

      if (res.ok) {
        const data = (await res.json()) as Issue[];
        if (!Array.isArray(data)) {
          console.error("[issues] GET /issues returned a non-array body");
          return { status: "error", reason: "server-error" };
        }
        if (data.length === 0) return { status: "empty" };

        return { status: "ok", data, hasMore: res.headers.get("X-Next-Cursor") !== null };
      }

      if (!isLastAttempt && isTransient(res.status)) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      console.error("[issues] GET /issues failed", {
        status: res.status,
        code: await readBackendErrorCode(res),
        requestId: res.headers.get("x-request-id"),
        attempt: attempt + 1,
      });
      return { status: "error", reason: reasonForStatus(res.status) };
    } catch (err) {
      if (!isLastAttempt) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      console.error("[issues] GET /issues could not be reached", {
        error: err instanceof Error ? err.message : String(err),
        attempt: attempt + 1,
      });
      return { status: "error", reason: "unreachable" };
    }
  }

  // Unreachable — the loop always returns on its last attempt — but keeps
  // the function total for the type checker.
  return { status: "error", reason: "server-error" };
}
