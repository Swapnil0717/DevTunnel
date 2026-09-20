// Server Component only — reads request cookies directly (getGithubProjectBySlug)
// or via `fetchCatalogPreview` (getGithubProjects); don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import { fetchCatalogPreview } from "./fetch-catalog-preview";
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
 * Returns only the first page (`CATALOG_PREVIEW_LIMIT` rows, ranked by
 * stars) plus `hasMore`, not the whole catalog: walking every page
 * before rendering made the page wait on a full-catalog read. The page's
 * "Load all projects" button fetches the remainder from the browser
 * (`lib/github-projects/catalog-client.ts`) when a contributor wants it.
 * The backend's `before` cursor is an opaque offset into its own cached,
 * stars-ranked catalog — `fetchCatalogPreview` only ever asks for the
 * first page, so it never needs to interpret one.
 */
type GithubProjectsResult =
  | { status: "ok"; data: GithubProjectSummary[]; hasMore: boolean }
  | { status: "empty" }
  | { status: "error" };

export async function getGithubProjects(): Promise<GithubProjectsResult> {
  return fetchCatalogPreview<GithubProjectSummary>("/github-projects");
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