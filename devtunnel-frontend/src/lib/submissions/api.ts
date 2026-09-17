// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { Submission, SubmissionListFilters } from "./types";
import { buildSubmissionsQuery } from "./query";

/**
 * `GET /submissions` — backs the Community page (`/submissions`).
 *
 * The first page is rendered on the server with the default filters, so
 * someone landing on `/submissions` sees real rows rather than a spinner
 * that then fetches. Every filter change after that goes through
 * `lib/submissions/client-api.ts` instead, since sorting and the
 * category/tech filters run in Postgres (the read is capped, so
 * re-sorting a truncated page in the browser would answer a different
 * question).
 *
 * `buildSubmissionsQuery` lives in `./query.ts`, not in this file. This
 * file imports `next/headers`, which makes it server-only — anything
 * that imports it can never be pulled into a "use client" component.
 * `client-api.ts` needs the identical query-building logic from the
 * browser, so it now imports it from the shared, dependency-free
 * `./query.ts` instead of from here (see that file's doc comment for the
 * "Cannot find module 'next/headers'" bug this fixes).
 *
 * Two outcomes rather than three: this is a list, so there's no
 * "not found" — an empty community list and a filter that matched
 * nothing are both legitimately `[]`, and the page tells them apart by
 * whether any filter is active (rule 25).
 */
export type SubmissionsResult =
  | { status: "ok"; data: Submission[] }
  | { status: "error" };

export async function getSubmissions(
  filters: SubmissionListFilters,
): Promise<SubmissionsResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/submissions?${buildSubmissionsQuery(filters)}`, {
      headers: { cookie: cookies().toString() },
      cache: "no-store",
    });

    if (!res.ok) return { status: "error" };

    return { status: "ok", data: (await res.json()) as Submission[] };
  } catch {
    return { status: "error" };
  }
}