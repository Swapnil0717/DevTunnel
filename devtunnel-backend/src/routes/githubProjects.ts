import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { handleCatalogListRequest, type CatalogRouteConfig } from "../lib/githubCatalog";
import type { Env, Variables } from "../types";

/**
 * Contributor — GitHub Projects (`/github-projects` — "GitHub Projects"
 * in `AppSidebar`, devtunnel-frontend's `lib/github-projects/{types,api}.ts`).
 * Mounted on the app root in src/index.ts (`app.route("/", githubProjects)`)
 * — reachable by any signed-in contributor, not just admins.
 *
 * Deliberately NOT the same data source as `/projects` ("Projects on
 * DevTunnel", src/routes/admin's onboarded-project tables): this route
 * never touches Supabase. It's a live, GitHub-wide catalog of real
 * open-source repositories — "every GitHub project", not just the
 * handful DevTunnel has onboarded. The actual scan/cache/paginate/map
 * logic is shared with the sibling `GET /github-open-source-tools` route
 * (src/routes/githubOpenSourceTools.ts) via `lib/githubCatalog.ts` — see
 * that module's doc comment for the full reasoning on the
 * `GITHUB_DISCOVERY_TOKEN` credential choice and the cache-then-paginate
 * shape. This file only supplies what's specific to *this* catalog: its
 * discovery query and its own cache key.
 */
export const githubProjects = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * "Real open source, worth showing a contributor" — public, non-archived,
 * non-fork repositories with a minimum star floor. The floor exists
 * purely to keep the catalog worth browsing (GitHub has millions of
 * single-star personal repos that would otherwise dominate a purely
 * `sort=stars` walk's lower pages) — it is not a claim about what counts
 * as "real" open source, just a relevance cutoff for this page.
 *
 * Exported so the scheduled cache warmer (`lib/cacheWarmers.ts`) can
 * re-scan this exact catalog on a cron, without duplicating its
 * discovery query/cache key here a second time.
 */
export const CATALOG_CONFIG: CatalogRouteConfig = {
  name: "github-projects",
  // A single query, so no OR-across-qualifiers concern here — see
  // `lib/githubCatalog.ts`'s `CatalogRouteConfig.discoveryQueries` doc
  // comment for why this is an array at all.
  discoveryQueries: ["is:public archived:false fork:false stars:>=50"],
  cacheKey: "github-projects:catalog:v1",
};

/**
 * `GET /github-projects` — a live, GitHub-wide catalog of real
 * open-source repositories (not DevTunnel's onboarded project list),
 * keyset-paginated exactly like every other list route in this backend
 * (`limit`/`before` query params, `X-Next-Cursor` response header) so it
 * plugs straight into the frontend's existing `fetchAllAdminPages`
 * walker with zero frontend changes.
 */
githubProjects.get("/github-projects", requireAuth, (c) =>
  handleCatalogListRequest(c, CATALOG_CONFIG),
);