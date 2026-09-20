// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as
// `lib/projects/client-api.ts`. Kept out of `./api.ts`, which reads
// request cookies via `next/headers` and can only run on the server.
import { API_BASE_URL } from "@/lib/config";
import type {
  CreatedSubmission,
  Submission,
  SubmissionDetail,
  SubmissionDraft,
  SubmissionDraftDetails,
  SubmissionKind,
  SubmissionListFilters,
} from "./types";
// From `./query.ts`, not `./api.ts`: `api.ts` imports `next/headers` to
// read request cookies (Server Component only), and this file is
// imported by "use client" components. Importing `buildSubmissionsQuery`
// from `api.ts` would drag `next/headers` into the client bundle through
// this chain — that's the "Cannot find module 'next/headers'" error.
// `query.ts` has no server-only dependencies, so both this file and
// `api.ts` import it independently instead of one depending on the other.
import { buildSubmissionsQuery } from "./query";

export class SubmissionsApiError extends Error {
  status: number;
  /**
   * The backend's own `error.code` (devtunnel-backend `lib/response.ts`).
   * The wizard branches on several of these by name —
   * `not_a_github_repository`, `repository_not_public`,
   * `repository_not_found`, `already_submitted` — because each one has a
   * different thing the contributor can actually do about it, and
   * collapsing them into "something went wrong" would hide the fix.
   */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "SubmissionsApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseError(res: Response): Promise<SubmissionsApiError> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return new SubmissionsApiError(
      body.error?.message ?? "Request failed",
      res.status,
      body.error?.code,
    );
  } catch {
    return new SubmissionsApiError("Request failed", res.status);
  }
}

/** Re-reads the list whenever a filter changes. */
export async function fetchSubmissions(filters: SubmissionListFilters): Promise<Submission[]> {
  const res = await fetch(`${API_BASE_URL}/submissions?${buildSubmissionsQuery(filters)}`, {
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as Submission[];
}

export interface SubmissionUpvoteStatus {
  upvotedByViewer: boolean;
  upvoteCount: number;
}

/**
 * `PUT` / `DELETE /submissions/:slug/upvote`.
 *
 * The response carries the real count read back after the write, so the
 * card renders what the server has rather than an increment the browser
 * guessed — which matters here, since that same count is what the
 * Popular sort orders by.
 */
export async function setSubmissionUpvote(
  slug: string,
  upvoted: boolean,
): Promise<SubmissionUpvoteStatus> {
  const res = await fetch(`${API_BASE_URL}/submissions/${encodeURIComponent(slug)}/upvote`, {
    method: upvoted ? "PUT" : "DELETE",
    credentials: "include",
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as SubmissionUpvoteStatus;
}

/**
 * `PUT /submissions/:slug` — saves an edit to a published submission's
 * details (the same description / tech stack / paid-alternative fields
 * the submit wizard's step 2 collects).
 *
 * Owner-only on the backend: rejects with `SubmissionsApiError` status
 * `403` (code `forbidden`) for anyone but the person who submitted it, so
 * hiding the Edit button is a courtesy and never the protection. Resolves
 * with the row as the server stored it.
 */
export async function updateSubmissionDetails(
  slug: string,
  details: SubmissionDraftDetails,
): Promise<SubmissionDetail> {
  const res = await fetch(`${API_BASE_URL}/submissions/${encodeURIComponent(slug)}`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(details),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as SubmissionDetail;
}

/* -------------------------------------------------------------------------
 * The submit wizard.
 * ---------------------------------------------------------------------- */

/** Step 1 — fetches the repository. `draftId` when correcting a URL already imported. */
export async function importSubmissionUrl(
  url: string,
  kind: SubmissionKind,
  draftId?: string,
): Promise<SubmissionDraft> {
  const res = await fetch(`${API_BASE_URL}/submissions/draft/url`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, kind, draftId }),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as SubmissionDraft;
}

/** Step 2 — description choice, tech stack, paid-alternative classification. */
export async function saveSubmissionDetails(
  draftId: string,
  details: SubmissionDraftDetails,
): Promise<SubmissionDraft> {
  const res = await fetch(
    `${API_BASE_URL}/submissions/draft/${encodeURIComponent(draftId)}/details`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(details),
    },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as SubmissionDraft;
}

/** Re-reads the draft for the preview step, so it shows what the server stored, not local state. */
export async function fetchSubmissionDraft(draftId: string): Promise<SubmissionDraft> {
  const res = await fetch(
    `${API_BASE_URL}/submissions/draft/${encodeURIComponent(draftId)}`,
    { credentials: "include" },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as SubmissionDraft;
}

/** Step 3 — publishes. Can reject with `already_submitted` (409). */
export async function completeSubmission(draftId: string): Promise<CreatedSubmission> {
  const res = await fetch(
    `${API_BASE_URL}/submissions/draft/${encodeURIComponent(draftId)}/complete`,
    { method: "POST", credentials: "include" },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as CreatedSubmission;
}