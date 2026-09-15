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
  filters: {
    /**
     * "Alternative to paid software" — narrows the catalog to
     * repositories that read as a free, open-source stand-in for a
     * commercial/SaaS product, rather than every developer tool.
     * Deliberately drops this route's own CLI/devtools topic OR-group
     * above (an alternative to paid software is frequently a full
     * application — a Notion, Airtable, or Photoshop stand-in — not a
     * CLI or dev-workflow utility, so requiring one of those topics
     * would wrongly exclude most of what this filter is for) and
     * replaces it with two independent signals GitHub Search supports
     * natively, OR'd together since either alone is real evidence:
     *
     * 1. `topic:` qualifiers for the handful of conventions maintainers
     *    actually use to self-tag this exact positioning (GitHub has no
     *    single canonical topic for it, so several near-synonyms are
     *    checked).
     * 2. The literal phrase "alternative to" in the repository's name,
     *    description, or topics (`in:name,description,topics` — GitHub
     *    Search's supported qualifier values for `in:` on repository
     *    search) — the actual wording maintainers overwhelmingly use
     *    when describing this kind of project ("An open source
     *    alternative to Notion", "Self-hosted alternative to
     *    Airtable", etc.), independent of whether they also applied a
     *    matching topic.
     *
     * Same public/non-archived/non-fork baseline as every other catalog
     * here; the star floor is dropped to `>=10` rather than reusing the
     * base config's `>=20` because this is already a much narrower
     * population than "all developer tools" — holding it to the same
     * floor would under-populate the catalog with newer, still-small
     * alternatives that are nonetheless exactly what this filter is
     * for.
     */
    "alternative-to-paid": {
      discoveryQuery:
        'is:public archived:false fork:false stars:>=10 (topic:alternative-to OR topic:open-source-alternative OR topic:open-source-alternatives OR topic:foss-alternative OR topic:saas-alternative OR "alternative to" in:name,description,topics)',
      cacheKey: "github-open-source-tools:catalog:alternative-to-paid:v1",
    },
  },
};

/**
 * `GET /github-open-source-tools` — a live, GitHub-wide catalog of
 * open-source developer tools, keyset-paginated exactly like
 * `GET /github-projects` (`limit`/`before` query params,
 * `X-Next-Cursor` response header) — same contract, same
 * `fetchAllAdminPages` frontend walker, different discovery query.
 *
 * Also accepts an optional `?filter=alternative-to-paid`, the one named
 * filter this catalog declares (see `CATALOG_CONFIG.filters` above) —
 * when present, `handleCatalogListRequest` swaps in that filter's own
 * discovery query and cache slot instead of the base catalog; any other
 * `?filter=` value 400s rather than silently returning the unfiltered
 * list.
 */
githubOpenSourceTools.get("/github-open-source-tools", requireAuth, (c) =>
  handleCatalogListRequest(c, CATALOG_CONFIG),
);