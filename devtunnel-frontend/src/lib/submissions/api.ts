// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { Submission, SubmissionListFilters } from "./types";

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
 * Two outcomes rather than three: this is a list, so there's no
 * "not found" — an empty community list and a filter that matched
 * nothing are both legitimately `[]`, and the page tells them apart by
 * whether any filter is active (rule 25).
 */
export type SubmissionsResult =
  | { status: "ok"; data: Submission[] }
  | { status: "error" };

export function buildSubmissionsQuery(filters: SubmissionListFilters): string {
  const params = new URLSearchParams();
  params.set("sort", filters.sort);
  params.set("category", filters.category);
  if (filters.techStack.length > 0) params.set("tech", filters.techStack.join(","));
  if (filters.query.trim()) params.set("q", filters.query.trim());
  return params.toString();
}

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