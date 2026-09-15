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
 * difference is `CATALOG_CONFIG.discoveryQueries` below: where
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
 * further to repositories tagged as a CLI, a developer-tool, or general
 * tooling/utility project. A lower star floor than `/github-projects`
 * (20 vs. 50) is deliberate: focused developer tools generally accumulate
 * stars slower than broad-audience projects (frameworks, learning
 * resources, "awesome" lists) do, so reusing the same floor here would
 * under-populate this catalog relative to how many genuinely useful,
 * actively maintained tools actually exist at that popularity level.
 *
 * One query *per* topic rather than a single `(topic:a OR topic:b OR
 * ...)` query: GitHub's Search API does not support OR'ing multiple
 * qualifiers together in one request. Confirmed directly against the
 * live API — `stars:>=20 (topic:cli OR topic:devtools)` doesn't error,
 * it just matches essentially nothing (`total_count: 0` on the real
 * production query), which is why this catalog was silently empty
 * rather than erroring. `lib/githubCatalog.ts`'s `scanCatalog` runs
 * each of these separately and merges/de-duplicates the results, which
 * is the only way to get true OR-of-topics behavior out of this API.
 */
const OPEN_SOURCE_TOOL_TOPICS = [
  "cli",
  "developer-tools",
  "devtools",
  "tool",
  "tooling",
  "productivity-tool",
  "utility",
];

const CATALOG_CONFIG: CatalogRouteConfig = {
  name: "github-open-source-tools",
  discoveryQueries: OPEN_SOURCE_TOOL_TOPICS.map(
    (topic) => `is:public archived:false fork:false stars:>=20 topic:${topic}`,
  ),
  cacheKey: "github-open-source-tools:catalog:v1",
  filters: {
    /**
     * "Alternative to paid software" — narrows the catalog to
     * repositories that read as a free, open-source stand-in for a
     * commercial/SaaS product, rather than every developer tool.
     * Deliberately drops this route's own CLI/devtools topics above (an
     * alternative to paid software is frequently a full application —
     * a Notion, Airtable, or Photoshop stand-in — not a CLI or
     * dev-workflow utility, so requiring one of those topics would
     * wrongly exclude most of what this filter is for) and replaces it
     * with two independent signals instead, same "one query per signal,
     * merged" shape the base catalog above uses — GitHub Search still
     * can't OR qualifiers together even within this narrower filter:
     *
     * 1. `topic:` qualifiers for the handful of conventions maintainers
     *    actually use to self-tag this exact positioning (GitHub has no
     *    single canonical topic for it, so several near-synonyms are
     *    checked, one query each).
     * 2. The literal phrase "alternative to" in the repository's name,
     *    description, or topics (`in:name,description,topics` — GitHub
     *    Search's supported qualifier values for `in:` on repository
     *    search) — the actual wording maintainers overwhelmingly use
     *    when describing this kind of project ("An open source
     *    alternative to Notion", "Self-hosted alternative to
     *    Airtable", etc.), independent of whether they also applied a
     *    matching topic. This one is a single query since it's a plain
     *    text term plus one qualifier — no OR involved, so it isn't
     *    subject to the same limitation.
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
      discoveryQueries: [
        ...[
          "alternative-to",
          "open-source-alternative",
          "open-source-alternatives",
          "foss-alternative",
          "saas-alternative",
        ].map((topic) => `is:public archived:false fork:false stars:>=10 topic:${topic}`),
        'is:public archived:false fork:false stars:>=10 "alternative to" in:name,description,topics',
      ],
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
 * discovery queries and cache slot instead of the base catalog; any
 * other `?filter=` value 400s rather than silently returning the
 * unfiltered list.
 */
githubOpenSourceTools.get("/github-open-source-tools", requireAuth, (c) =>
  handleCatalogListRequest(c, CATALOG_CONFIG),
);