import type { SubmissionListFilters } from "./types";

/**
 * Builds the `GET /submissions` query string from a filter set.
 *
 * Pulled out of `./api.ts` on purpose: `api.ts` imports `next/headers`
 * to read request cookies, which makes it a **server-only** module —
 * anything that imports it can never be pulled into a "use client"
 * component. `client-api.ts` needs this same query-building logic (it
 * calls the identical endpoint from the browser on every filter change),
 * so it used to import `buildSubmissionsQuery` from `./api` directly.
 * That one import dragged `next/headers` into the client bundle through
 * the whole chain — `client-api.ts` → `api.ts` → `next/headers` — which
 * is exactly the "Cannot find module 'next/headers'" / "don't import
 * from client code" error Next throws.
 *
 * This file has no server-only or client-only dependencies, so both
 * `api.ts` (Server Component reads) and `client-api.ts` (browser reads)
 * import it instead of one depending on the other.
 */
export function buildSubmissionsQuery(filters: SubmissionListFilters): string {
  const params = new URLSearchParams();
  params.set("sort", filters.sort);
  params.set("category", filters.category);
  if (filters.techStack.length > 0) params.set("tech", filters.techStack.join(","));
  if (filters.query.trim()) params.set("q", filters.query.trim());
  return params.toString();
}