// Server Component only — `fetchAllAdminPages` reads request cookies,
// don't import from client code.
import { fetchAllAdminPages } from "@/lib/admin/fetch-all-pages";
import type { GithubProjectSummary } from "@/lib/github-projects/types";

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