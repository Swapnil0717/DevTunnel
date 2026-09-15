// Server Component only — `fetchAllAdminPages` reads request cookies,
// don't import from client code.
import { fetchAllAdminPages } from "@/lib/admin/fetch-all-pages";
import type { GithubProjectSummary } from "./types";

/**
 * `GET /github-projects` — backs the contributor-facing **GitHub
 * Projects** page (`/github-projects` — "GitHub Projects" in
 * `AppSidebar`). Not confirmed against the backend yet — same
 * documented-assumption convention as `lib/issues/api.ts` and
 * `lib/admin/projects/api.ts` (Frontend_Development_Rules.txt rule 58:
 * don't invent data, but a plausible, clearly-flagged endpoint name is
 * fine while the backend catches up — TODO: confirm the real path with
 * backend). Every call is expected to fail (network error / 404) until
 * that route ships; `getGithubProjects` catches that and the page
 * degrades to one honest `SectionMessage`, never a blank/broken page.
 *
 * Reuses `fetchAllAdminPages` rather than a bespoke walk loop the way
 * `lib/issues/api.ts` has one: `fetchAllAdminPages` isn't actually tied
 * to the `/admin` prefix — it's a generic keyset-pagination walker any
 * `limit`/`before`/`X-Next-Cursor` list route can use (same reasoning
 * `lib/issues/issues-table.tsx`'s doc comment gives for reusing
 * `AdminTableRow`/`RepoLogo` here: role-agnostic logic shouldn't be
 * duplicated — rule 51). This list is a published, DB-backed repository
 * catalog — the same "cheap indexed database query per page" shape
 * `fetchAllAdminPages`'s own doc comment describes for `/admin/projects`
 * — not a live, re-computed-on-every-call GitHub scan the way `/issues`
 * is. That's also why `/github-projects/loading.tsx` renders a real
 * skeleton grid instead of a spinner: the wait here is a normal page
 * load, not a multi-second live scan.
 */
type GithubProjectsResult =
  | { status: "ok"; data: GithubProjectSummary[] }
  | { status: "empty" }
  | { status: "error" };

export async function getGithubProjects(): Promise<GithubProjectsResult> {
  const result = await fetchAllAdminPages<GithubProjectSummary>("/github-projects");
  if (result.status === "error") return { status: "error" };
  if (result.status === "empty") return { status: "empty" };
  return { status: "ok", data: result.data };
}