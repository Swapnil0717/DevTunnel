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
 * fetches the full cross-project list and lets `AdminNewIssuesExplorer`
 * narrow it by project client-side, the same division of labor
 * `AdminTasksExplorer` already uses for its own project filter.
 */
type AdminNewIssuesResult =
  | { status: "ok"; data: AdminNewIssue[] }
  | { status: "empty" }
  | { status: "error" };

export async function getAdminNewIssues(): Promise<AdminNewIssuesResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/admin/new-issues`, {
      headers: { cookie: cookies().toString() },
      cache: "no-store",
    });

    if (!res.ok) {
      return { status: "error" };
    }

    const data = (await res.json()) as AdminNewIssue[];

    if (Array.isArray(data) && data.length === 0) {
      return { status: "empty" };
    }

    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}