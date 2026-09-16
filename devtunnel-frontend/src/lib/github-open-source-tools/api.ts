// Server Component only — `fetchAllAdminPages` and `getGithubOpenSourceToolBySlug`
// both read request cookies, don't import from client code.
import { cookies } from "next/headers";
import { API_BASE_URL } from "@/lib/config";
import { fetchAllAdminPages } from "@/lib/admin/fetch-all-pages";
import type { GithubProjectDetail, GithubProjectSummary } from "@/lib/github-projects/types";

/**
 * `GET /github-open-source-tools` — backs the contributor-facing
 * **Github Open source tools** page (`/github-open-source-tools` —
 * "Github Open source tools" in `AppSidebar`). Sibling of
 * `lib/github-projects/api.ts`, built the exact same way — a live,
 * GitHub-wide catalog cached 30 minutes backend-side
 * (src/routes/githubOpenSourceTools.ts), walked in full via the same
 * generic `fetchAllAdminPages` keyset-pagination helper.
 *
 * Reuses `GithubProjectSummary` as-is (a type-only import, erased at
 * build time) rather than declaring a separate `GithubToolSummary` —
 * the backend maps both catalogs to the identical shape (see that
 * route's own doc comment), and this page reuses the identical card/grid
 * UI (`GithubProjectsExplorer`, `GithubProjectCard`) too, so a second,
 * structurally-identical type would carry no real distinction, only
 * duplication.
 *
 * `filter` (optional) is forwarded to the backend as `?filter=...` —
 * currently only `"alternative-to-paid"` is a recognized value
 * (`src/routes/githubOpenSourceTools.ts`'s `CATALOG_CONFIG.filters`);
 * omitting it (the default) gets the base, unfiltered tools catalog.
 * Passing an unrecognized value 400s the backend request, which surfaces
 * here as `{ status: "error" }` same as any other failed fetch — the
 * page's own `?filter=` search-param handling
 * (`app/(protected)/github-open-source-tools/page.tsx`) is what keeps a
 * bad value from ever reaching this function in the first place.
 */
type GithubOpenSourceToolsResult =
  | { status: "ok"; data: GithubProjectSummary[] }
  | { status: "empty" }
  | { status: "error" };

export async function getGithubOpenSourceTools(
  filter?: string,
): Promise<GithubOpenSourceToolsResult> {
  const result = await fetchAllAdminPages<GithubProjectSummary>(
    "/github-open-source-tools",
    undefined,
    filter ? { filter } : undefined,
  );
  if (result.status === "error") return { status: "error" };
  if (result.status === "empty") return { status: "empty" };
  return { status: "ok", data: result.data };
}

/**
 * `GET /github-open-source-tools/:slug` — backs the Tool Detail page
 * (`/github-open-source-tools/:slug`), the destination `GithubProjectCard`
 * now links to (via `cardBasePath`) instead of the GitHub Projects detail
 * route when a card is rendered on `/github-open-source-tools`. Sibling
 * of `getGithubProjectBySlug` (`lib/github-projects/api.ts`), built the
 * exact same way and reusing `GithubProjectDetail` as-is — same "identical
 * shape, only the catalog's population differs" reasoning
 * `getGithubOpenSourceTools` above already documents for the list route.
 *
 * Same three-outcome contract every other detail fetch in this app
 * follows: a slug that doesn't match any catalog entry renders Next's
 * real 404 via `notFound()` (`"not-found"`), any other failure degrades
 * to one honest `SectionMessage` (`"error"`), and cookies are forwarded
 * exactly like every other server-rendered read so the request rides the
 * same session the rest of the page uses.
 *
 * Not yet confirmed against a live backend route — same documented-
 * assumption convention `getGithubProjectBySlug` follows — TODO: confirm
 * the real path and response shape with backend once this endpoint
 * ships.
 */
type GithubOpenSourceToolDetailResult =
  | { status: "ok"; data: GithubProjectDetail }
  | { status: "not-found" }
  | { status: "error" };

export async function getGithubOpenSourceToolBySlug(
  slug: string,
): Promise<GithubOpenSourceToolDetailResult> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/github-open-source-tools/${encodeURIComponent(slug)}`,
      {
        headers: { cookie: cookies().toString() },
        cache: "no-store",
      },
    );

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