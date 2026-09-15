import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { handleCatalogListRequest, type CatalogRouteConfig } from "../lib/githubCatalog";
import type { Env, Variables } from "../types";

/**
 * Contributor — GitHub Open Source Tools (`/github-open-source-tools` —
 * "Github Open source tools" in `AppSidebar`). Sibling of
 * `GET /github-projects` (src/routes/githubProjects.ts), built on the
 * exact same shared shape (`lib/githubCatalog.ts`) — a live, GitHub-wide,
 * cached catalog rather than anything Supabase-backed. The only real
 * difference is `CATALOG_CONFIG.discoveryQuery` below: where
 * `/github-projects` samples popular open-source repositories generally,
 * this route narrows to repositories that read as developer *tools* —
 * CLIs, libraries, dev-workflow utilities — via GitHub topic qualifiers,
 * not general application/content projects.
 *
 * Distinct from `/opensource-tools` ("Open Source Tools on DevTunnel",
 * src/routes/admin/opensourceToolOnboarding.ts's Supabase-backed
 * counterpart): same relationship `/github-projects` has to `/projects`
 * — this is the unfiltered, GitHub-wide catalog; that one is DevTunnel's
 * own curated, onboarded list.
 */
export const githubOpenSourceTools = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Same public/non-archived/non-fork/star-floor baseline
 * `/github-projects` uses (see that route's own doc comment), narrowed
 * further with an OR'd set of topic qualifiers GitHub Search supports
 * natively — repositories tagged as a CLI, a developer-tool, or general
 * tooling/utility project. A lower star floor than `/github-projects`
 * (20 vs. 50) is deliberate: focused developer tools generally accumulate
 * stars slower than broad-audience projects (frameworks, learning
 * resources, "awesome" lists) do, so reusing the same floor here would
 * under-populate this catalog relative to how many genuinely useful,
 * actively maintained tools actually exist at that popularity level.
 */
const CATALOG_CONFIG: CatalogRouteConfig = {
  name: "github-open-source-tools",
  discoveryQuery:
    "is:public archived:false fork:false stars:>=20 (topic:cli OR topic:developer-tools OR topic:devtools OR topic:tool OR topic:tooling OR topic:productivity-tool OR topic:utility)",
  cacheKey: "github-open-source-tools:catalog:v1",
};

/**
 * `GET /github-open-source-tools` — a live, GitHub-wide catalog of
 * open-source developer tools, keyset-paginated exactly like
 * `GET /github-projects` (`limit`/`before` query params,
 * `X-Next-Cursor` response header) — same contract, same
 * `fetchAllAdminPages` frontend walker, different discovery query.
 */
githubOpenSourceTools.get("/github-open-source-tools", requireAuth, (c) =>
  handleCatalogListRequest(c, CATALOG_CONFIG),
);