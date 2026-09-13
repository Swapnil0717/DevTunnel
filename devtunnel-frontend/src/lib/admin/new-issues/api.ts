// Server Component only — reads request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import type { AdminNewIssue } from "./types";

/**
 * `GET /admin/new-issues` (admin_workflow.txt, section 16 — "New Issues
 * Section" ▸ Backend; section 22 — Admin Backend API Map). Not built on
 * the backend yet — see the note in `types.ts` — so, same convention as
 * `lib/admin/tasks/api.ts`, every call is expected to fail (network
 * error / 404) until that route ships. Catching that here means the
 * page degrades to one honest `SectionMessage`, never a blank/broken
 * page (Frontend_Development_Rules.txt rule 26).
 *
 * The spec also lists `GET /admin/projects/:id/new-issues` for a
 * per-project scoped view, but section 29's final page list only names
 * one route for this page (`/admin/tasks/new-issues`, A15) — so this
 * fetches one page of the cross-project list and lets
 * `AdminNewIssuesExplorer` narrow it by project client-side, the same
 * division of labor `AdminTasksExplorer` already uses for its own
 * project filter.
 *
 * The backend's `GET /admin/new-issues` is itself keyset-paginated
 * (`limit`/`before`, `X-Next-Cursor` response header — see that route's
 * own doc comment), so this forwards an optional `before` cursor and
 * surfaces `nextCursor` back to the caller. The page component pairs
 * this with `lib/admin/cursor-pagination.ts` to render real
 * Previous/Next controls instead of silently truncating the list to
 * whatever the first page happens to contain.
 */
type AdminNewIssuesResult =
  | { status: "ok"; data: AdminNewIssue[]; nextCursor: string | null }
  | { status: "empty" }
  | { status: "error" };

export async function getAdminNewIssues(params?: { before?: string }): Promise<AdminNewIssuesResult> {
  try {
    const query = new URLSearchParams();
    if (params?.before) query.set("before", params.before);
    const qs = query.toString();

    const res = await fetch(`${API_BASE_URL}/admin/new-issues${qs ? `?${qs}` : ""}`, {
      headers: { cookie: cookies().toString() },
      cache: "no-store",
    });

    if (!res.ok) {
      return { status: "error" };
    }

    const data = (await res.json()) as AdminNewIssue[];

    if (Array.isArray(data) && data.length === 0 && !params?.before) {
      return { status: "empty" };
    }

    return { status: "ok", data, nextCursor: res.headers.get("X-Next-Cursor") };
  } catch {
    return { status: "error" };
  }
}