// Server Component only — reads request cookies directly (getGithubProjectBySlug)
// or via `fetchAllAdminPages` (getGithubProjects); don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import { fetchAllAdminPages } from "@/lib/admin/fetch-all-pages";
import type { GithubProjectDetail, GithubProjectSummary } from "./types";

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

/**
 * `GET /github-projects/:slug` — backs the Project Detail page
 * (`/github-projects/:slug`), the destination `GithubProjectCard` links
 * to instead of opening straight out to GitHub. Same
 * documented-assumption convention `getGithubProjects` above and
 * `lib/tasks/api.ts`'s `getTaskDetail` already follow: not yet confirmed
 * against a live backend route, but a plausible single-resource
 * counterpart to the already-confirmed `GET /github-projects` list
 * (Frontend_Development_Rules.txt rule 58) — TODO: confirm the real
 * path and response shape with backend once `GET /github-projects/:slug`
 * ships.
 *
 * Same three-outcome contract `getTaskDetail` uses rather than throwing:
 * a slug that doesn't match any catalog entry renders Next's real 404
 * via `notFound()` (`"not-found"`), any other failure degrades to one
 * honest `SectionMessage` (`"error"`), and cookies are forwarded exactly
 * like every other server-rendered read in this app so the request rides
 * the same session the rest of the page uses.
 */
type GithubProjectDetailResult =
  | { status: "ok"; data: GithubProjectDetail }
  | { status: "not-found" }
  | { status: "error" };

export async function getGithubProjectBySlug(
  slug: string,
): Promise<GithubProjectDetailResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/github-projects/${encodeURIComponent(slug)}`, {
      headers: { cookie: (await cookies()).toString() },
      cache: "no-store",
    });

    if (res.status === 404) {
      return { status: "not-found" };
    }

    if (!res.ok) {
      return { status: "error" };
    }

    const data = (await res.json()) as GithubProjectDetail;
    return { status: "ok", data };
  } catch {
    return { status: "error" };
  }
}