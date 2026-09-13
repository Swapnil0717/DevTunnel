// Server Component only — this fetches through fetchAllAdminPages,
// which reads request cookies; don't import from client code.
import { fetchAllAdminPages } from "@/lib/admin/fetch-all-pages";
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
 * fetches the full cross-project list and lets `AdminNewIssuesExplorer`
 * narrow it by project client-side, the same division of labor
 * `AdminTasksExplorer` already uses for its own project filter.
 *
 * The backend's `GET /admin/new-issues` is itself keyset-paginated
 * (`limit`/`before`, `X-Next-Cursor` response header — see that route's
 * own doc comment). `fetchAllAdminPages` walks every page of it and
 * returns the complete result, so `AdminNewIssuesExplorer` can filter it
 * and then page through 20-at-a-time with real numbered "Page 1 of N"
 * controls, instead of silently truncating the list to whatever the
 * first backend page happened to contain.
 */
type AdminNewIssuesResult =
  | { status: "ok"; data: AdminNewIssue[] }
  | { status: "empty" }
  | { status: "error" };

export async function getAdminNewIssues(): Promise<AdminNewIssuesResult> {
  const result = await fetchAllAdminPages<AdminNewIssue>("/admin/new-issues");
  if (result.status === "error") return { status: "error" };
  if (result.status === "empty") return { status: "empty" };
  return { status: "ok", data: result.data };
}