// Server Component only — `fetchAllAdminPages` reads request cookies,
// don't import from client code.
import { fetchAllAdminPages } from "@/lib/admin/fetch-all-pages";
import type { GithubProjectSummary } from "./types";

/**
 * `GET /github-projects` — backs the contributor-facing **GitHub
 * Projects** page (`/github-projects` — "GitHub Projects" in
 * `AppSidebar`). Confirmed against the backend
 * (src/routes/githubProjects.ts): this is a live, GitHub-wide catalog of
 * real open-source repositories — not DevTunnel's own onboarded project
 * list (`lib/admin/projects/api.ts`'s "Projects on DevTunnel") — built
 * by searching GitHub itself and cached backend-side for 30 minutes, so
 * repeated loads within that window are cheap even though the
 * underlying data is a live cross-GitHub scan, not a database table.
 *
 * Reuses `fetchAllAdminPages` rather than a bespoke walk loop the way
 * `lib/issues/api.ts` has one: `fetchAllAdminPages` isn't actually tied
 * to the `/admin` prefix — it's a generic keyset-pagination walker any
 * `limit`/`before`/`X-Next-Cursor` list route can use (same reasoning
 * `lib/issues/issues-table.tsx`'s doc comment gives for reusing
 * `AdminTableRow`/`RepoLogo` here: role-agnostic logic shouldn't be
 * duplicated — rule 51). The backend's `before` cursor here is an opaque
 * offset into its own cached, stars-ranked catalog (not the ISO
 * timestamp `/issues` uses) — `fetchAllAdminPages` doesn't care, since
 * it only ever round-trips whatever `X-Next-Cursor` it was last given.
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