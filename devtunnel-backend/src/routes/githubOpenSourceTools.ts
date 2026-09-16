import { Hono } from "hono";
import { requireAuth } from "../middleware/auth";
import { handleCatalogListRequest, type CatalogRouteConfig } from "../lib/githubCatalog";
import { getEnv } from "../config/env";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { withCacheSWR } from "../lib/cache";
import { getSupabase } from "../lib/supabase";
import {
  fetchRepositoryCatalogSummary,
  fetchRepositoryContributorCount,
  fetchRepositoryIssues,
  fetchRepositoryReadme,
  starRepositoryForUser,
  unstarRepositoryForUser,
  GitHubRepoError,
  type GitHubRepoCatalogSummary,
} from "../lib/githubRepo";
import { mapGithubTopicsToTechStack } from "../lib/techTopics";
import { recordGithubToolNomination } from "../db/githubOpenSourceToolNominations";
import { getValidGithubAccessToken } from "../db/githubTokens";
import { addGithubStar, removeGithubStar, getGithubStarStatus } from "../db/githubStars";
import type { Env, Variables, GithubIssueSummary } from "../types";

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
// Exported below so the scheduled cache warmer (`lib/cacheWarmers.ts`) can
// re-scan this exact catalog (base + every filter) on a cron, without
// duplicating its discovery queries/cache keys here a second time.
const OPEN_SOURCE_TOOL_TOPICS = [
  "cli",
  "developer-tools",
  "devtools",
  "tool",
  "tooling",
  "productivity-tool",
  "utility",
];

export const CATALOG_CONFIG: CatalogRouteConfig = {
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

/**
 * Soft/hard TTL for one repository's detail-view cache slot — same
 * value and same reasoning as `/github-projects/:slug`'s own constant
 * (src/routes/githubProjects.ts): a single-repository lookup is cheap
 * enough (repo metadata + README + issues + contributor count) to
 * refresh far more often than the 30-minute catalog scan TTL
 * (`lib/githubCatalog.ts` `CATALOG_CACHE_SOFT_TTL_SECONDS`).
 */
const DETAIL_CACHE_SOFT_TTL_SECONDS = 10 * 60;
const DETAIL_CACHE_HARD_TTL_SECONDS = DETAIL_CACHE_SOFT_TTL_SECONDS * 3;

/**
 * Reverses the catalog's own slug encoding (`lib/githubCatalog.ts`
 * `toSummary`: `item.full_name.toLowerCase().replace("/", "--")`) —
 * identical helper to `/github-projects`'s `slugToOwnerRepo`
 * (src/routes/githubProjects.ts), duplicated locally rather than
 * shared since it's a two-line pure function and both routes already
 * keep their detail-route specifics (this file's own doc comment)
 * local rather than centralized. `full_name` always contains exactly
 * one `/`, so splitting on the *first* `--` is always the correct
 * inverse, never a repo name's own internal hyphens. Returns `null`
 * for a slug that doesn't contain that separator at all, which the
 * caller treats as `not-found` rather than guessing at a malformed
 * owner/repo pair.
 */
function slugToOwnerRepo(slug: string): { owner: string; repo: string } | null {
  const separatorIndex = slug.indexOf("--");
  if (separatorIndex === -1) return null;
  const owner = slug.slice(0, separatorIndex);
  const repo = slug.slice(separatorIndex + 2);
  if (!owner || !repo) return null;
  return { owner, repo };
}

/**
 * Same `GithubProjectDetail`-shaped payload `/github-projects/:slug`
 * returns (src/routes/githubProjects.ts) — devtunnel-frontend's
 * `lib/github-open-source-tools/types.ts` mirrors that same shape for
 * this catalog's detail page, so the two payloads intentionally stay
 * field-for-field identical even though each route keeps its own
 * local copy of the interface (nothing else in this backend needs it —
 * Backend_Development_Rules.txt rule 51).
 */
interface GithubToolIssuePreview {
  id: string;
  number: number;
  title: string;
  url: string;
  labels: string[];
  commentCount: number;
  createdAt: string;
}

interface GithubToolDetailPayload {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  repositoryUrl: string;
  repositoryFullName: string;
  owner: GitHubRepoCatalogSummary["owner"];
  primaryLanguage: string | null;
  techStack: string[];
  license: string | null;
  stars: number;
  forks: number;
  openIssuesCount: number;
  contributorCount: number;
  createdAt: string;
  pushedAt: string;
  readme: string | null;
  openIssues: GithubToolIssuePreview[];
}

/**
 * The two viewer-specific fields layered onto the cached
 * `GithubToolDetailPayload` before it's sent — same reasoning as
 * `/github-projects/:slug`'s own `GithubStarViewerFields`
 * (src/routes/githubProjects.ts): kept out of the cached object since
 * that cache slot is shared across every contributor viewing this
 * repository.
 */
interface GithubToolStarViewerFields {
  isStarredByViewer: boolean;
  localStarCount: number;
}

function toIssuePreview(issue: GithubIssueSummary): GithubToolIssuePreview {
  return {
    // GitHub issue numbers are only unique within one repository, not
    // globally — `url` doubles as a stable per-repository-scoped id
    // here since this preview has no database row of its own to key
    // on. Same posture as `/github-projects/:slug`'s own `toIssuePreview`.
    id: issue.url,
    number: issue.number,
    title: issue.title,
    url: issue.url,
    labels: issue.labels,
    commentCount: issue.commentCount,
    createdAt: issue.createdAt,
  };
}

/**
 * How many open issues the Issues tab shows for one repository — same
 * "first page only" posture as `/github-projects/:slug`'s own
 * `DETAIL_ISSUES_LIMIT`.
 */
const DETAIL_ISSUES_LIMIT = 30;

/**
 * `GET /github-open-source-tools/:slug` — backs the Open Source Tools
 * Detail page (`/github-open-source-tools/:slug`), the destination
 * `GithubProjectCard` links to for this catalog instead of opening
 * straight out to GitHub. Field-for-field the same fetch/cache shape
 * as `/github-projects/:slug` (src/routes/githubProjects.ts) — see
 * that route for the full reasoning on the `GITHUB_DISCOVERY_TOKEN`
 * credential choice and the cache-then-fetch posture — kept as its own
 * handler rather than shared because the two routes' cache key
 * namespaces need to stay independent (a tool and a project can share
 * the exact same `owner/repo` slug in principle, and this route's
 * cache must never serve that repository's project-catalog detail
 * payload or vice versa).
 *
 * A slug that doesn't decode to a plausible `owner/repo` pair, or a
 * repository GitHub reports as not found, both respond 404 — the
 * frontend's `getGithubToolBySlug`
 * (`lib/github-open-source-tools/api.ts`) treats both the same way
 * (`notFound()`), so there's no need to distinguish them on the wire.
 */
githubOpenSourceTools.get("/github-open-source-tools/:slug", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "github-open-source-tools-detail",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsedSlug = slugToOwnerRepo(slug);
  if (!parsedSlug) {
    return errorResponse(c, 404, "not_found", "This tool isn't in the GitHub catalog");
  }
  const { owner, repo } = parsedSlug;

  try {
    const payload = await withCacheSWR<GithubToolDetailPayload>(
      c.executionCtx,
      c.env,
      `github-open-source-tool-detail:${owner.toLowerCase()}--${repo.toLowerCase()}:v1`,
      {
        softTtlSeconds: DETAIL_CACHE_SOFT_TTL_SECONDS,
        hardTtlSeconds: DETAIL_CACHE_HARD_TTL_SECONDS,
      },
      async () => {
        const [summary, readme, openIssuesRaw, contributorCount] = await Promise.all([
          fetchRepositoryCatalogSummary(env.GITHUB_DISCOVERY_TOKEN, owner, repo),
          fetchRepositoryReadme(env.GITHUB_DISCOVERY_TOKEN, owner, repo),
          fetchRepositoryIssues(env.GITHUB_DISCOVERY_TOKEN, owner, repo, DETAIL_ISSUES_LIMIT),
          fetchRepositoryContributorCount(env.GITHUB_DISCOVERY_TOKEN, owner, repo),
        ]);

        return {
          id: summary.fullName,
          slug,
          name: summary.name,
          description: summary.description,
          repositoryUrl: summary.htmlUrl,
          repositoryFullName: summary.fullName,
          owner: summary.owner,
          primaryLanguage: summary.primaryLanguage,
          techStack: mapGithubTopicsToTechStack(summary.topics, summary.primaryLanguage),
          license: summary.license,
          stars: summary.stars,
          forks: summary.forks,
          openIssuesCount: summary.openIssues,
          contributorCount,
          createdAt: summary.createdAt,
          pushedAt: summary.pushedAt,
          readme,
          openIssues: openIssuesRaw.map(toIssuePreview),
        };
      },
    );

    if (!payload) {
      return errorResponse(c, 500, "internal_error", "Couldn't load this tool right now");
    }

    // Per-viewer, never cached alongside the payload above — see
    // `GithubToolStarViewerFields`'s doc comment.
    const supabase = getSupabase(env);
    const starStatus = await getGithubStarStatus(supabase, payload.repositoryFullName, user.id);
    const response: GithubToolDetailPayload & GithubToolStarViewerFields = {
      ...payload,
      isStarredByViewer: starStatus.starredByViewer,
      localStarCount: starStatus.localStarCount,
    };

    return c.json(response, 200);
  } catch (err) {
    if (err instanceof GitHubRepoError) {
      if (err.reason === "not_found") {
        return errorResponse(c, 404, "not_found", "This tool isn't in the GitHub catalog");
      }
      if (err.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", err.message);
      }
      logger.error("github_tool_detail_github_error", {
        reason: err.reason,
        owner,
        repo,
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now");
    }

    logger.error("github_tool_detail_failed", {
      error: err instanceof Error ? err.message : String(err),
      owner,
      repo,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load this tool right now");
  }
});

/**
 * Resolves a usable GitHub access token for the requesting user, or
 * `null` when none exists — same shape as
 * `/github-projects`'s own `resolveStarAccessToken`
 * (src/routes/githubProjects.ts), duplicated locally rather than
 * centralized since it's a one-line wrapper around
 * `getValidGithubAccessToken`.
 */
async function resolveStarAccessToken(
  env: ReturnType<typeof getEnv>,
  userId: string,
): Promise<string | null> {
  const supabase = getSupabase(env);
  return getValidGithubAccessToken(supabase, env, userId);
}

/**
 * `PUT /github-open-source-tools/:slug/star` — the Open Source Tools
 * Detail page's "Star" button. Identical contract and posture to
 * `/github-projects/:slug/star` (src/routes/githubProjects.ts) — see
 * that route's doc comment for the full reasoning — stars the
 * repository on the contributor's own real GitHub account
 * (`lib/githubRepo.ts` `starRepositoryForUser`) and only then records
 * the local `github_stars` row (`db/githubStars.ts` `addGithubStar`),
 * which both catalogs' Detail pages read back (sql/025: one shared
 * stars table, not one per catalog).
 */
githubOpenSourceTools.put("/github-open-source-tools/:slug/star", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "github-open-source-tools-star",
    limit: 30,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsedSlug = slugToOwnerRepo(slug);
  if (!parsedSlug) {
    return errorResponse(c, 404, "not_found", "This tool isn't in the GitHub catalog");
  }
  const { owner, repo } = parsedSlug;
  const repositoryFullName = `${owner}/${repo}`;

  const accessToken = await resolveStarAccessToken(env, user.id);
  if (!accessToken) {
    return errorResponse(
      c,
      403,
      "github_reauth_required",
      "Reconnect your GitHub account to star this tool",
    );
  }

  try {
    await starRepositoryForUser(accessToken, owner, repo);

    const supabase = getSupabase(env);
    await addGithubStar(supabase, {
      repositoryFullName,
      repositoryUrl: `https://github.com/${repositoryFullName}`,
      starredBy: user.id,
    });
    const starStatus = await getGithubStarStatus(supabase, repositoryFullName, user.id);

    return c.json(starStatus, 200);
  } catch (err) {
    if (err instanceof GitHubRepoError) {
      if (err.reason === "unauthorized") {
        return errorResponse(
          c,
          403,
          "github_reauth_required",
          "Reconnect your GitHub account to star this tool",
        );
      }
      if (err.reason === "not_found") {
        return errorResponse(c, 404, "not_found", "This tool isn't in the GitHub catalog");
      }
      if (err.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", err.message);
      }
      logger.error("github_tool_star_github_error", {
        reason: err.reason,
        owner,
        repo,
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now");
    }

    logger.error("github_tool_star_failed", {
      error: err instanceof Error ? err.message : String(err),
      owner,
      repo,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't star this tool right now");
  }
});

/**
 * `DELETE /github-open-source-tools/:slug/star` — the reverse of the
 * `PUT` above: unstars on the contributor's real GitHub account, then
 * removes the matching local `github_stars` row.
 */
githubOpenSourceTools.delete("/github-open-source-tools/:slug/star", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "github-open-source-tools-star",
    limit: 30,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsedSlug = slugToOwnerRepo(slug);
  if (!parsedSlug) {
    return errorResponse(c, 404, "not_found", "This tool isn't in the GitHub catalog");
  }
  const { owner, repo } = parsedSlug;
  const repositoryFullName = `${owner}/${repo}`;

  const accessToken = await resolveStarAccessToken(env, user.id);
  if (!accessToken) {
    return errorResponse(
      c,
      403,
      "github_reauth_required",
      "Reconnect your GitHub account to unstar this tool",
    );
  }

  try {
    await unstarRepositoryForUser(accessToken, owner, repo);

    const supabase = getSupabase(env);
    await removeGithubStar(supabase, repositoryFullName, user.id);
    const starStatus = await getGithubStarStatus(supabase, repositoryFullName, user.id);

    return c.json(starStatus, 200);
  } catch (err) {
    if (err instanceof GitHubRepoError) {
      if (err.reason === "unauthorized") {
        return errorResponse(
          c,
          403,
          "github_reauth_required",
          "Reconnect your GitHub account to unstar this tool",
        );
      }
      if (err.reason === "not_found") {
        return errorResponse(c, 404, "not_found", "This tool isn't in the GitHub catalog");
      }
      if (err.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", err.message);
      }
      logger.error("github_tool_unstar_github_error", {
        reason: err.reason,
        owner,
        repo,
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now");
    }

    logger.error("github_tool_unstar_failed", {
      error: err instanceof Error ? err.message : String(err),
      owner,
      repo,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't unstar this tool right now");
  }
});

/**
 * `POST /github-open-source-tools/:slug/request-onboarding` — the Open
 * Source Tools Detail page's "Nominate for DevTunnel" action
 * (`RequestToolOnboardingButton`, devtunnel-frontend
 * `components/github-open-source-tools/request-tool-onboarding-button.tsx`).
 * Identical contract and posture to
 * `/github-projects/:slug/request-onboarding`
 * (src/routes/githubProjects.ts) — see that route's doc comment for
 * the full reasoning — pointed at `recordGithubToolNomination`
 * (`db/githubOpenSourceToolNominations.ts`) instead, so this catalog's
 * nominations land in their own queue (sql/024) rather than the
 * project catalog's (sql/023).
 *
 * This never onboards the repository itself — it only records that a
 * signed-in contributor thinks the repository is worth an Admin
 * running the real, multi-step Project Onboarding flow (sql/006) on.
 * `recordGithubToolNomination` de-duplicates against a repository
 * that's already awaiting review (sql/024's partial unique index)
 * rather than piling up repeat rows — either outcome ("created" or
 * "already-pending") is reported back the same reassuring way, since
 * from the contributor's side both mean "an admin will see this".
 *
 * The slug only needs to decode to a plausible `owner/repo` pair here —
 * unlike the detail route above, this never calls GitHub itself to
 * confirm the repository still exists, since a nomination for a
 * repository that's since gone private or been deleted is still
 * harmless for an Admin to see and dismiss.
 */
githubOpenSourceTools.post(
  "/github-open-source-tools/:slug/request-onboarding",
  requireAuth,
  async (c) => {
    const user = c.get("user");
    if (!user) {
      return errorResponse(c, 401, "unauthenticated", "Sign-in required");
    }
    const slug = c.req.param("slug");

    const withinLimit = await checkRateLimit(c, {
      bucket: "github-open-source-tools-nominate",
      limit: 10,
      windowSeconds: 60,
    });
    if (!withinLimit) {
      return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
    }

    const parsedSlug = slugToOwnerRepo(slug);
    if (!parsedSlug) {
      return errorResponse(c, 404, "not_found", "This tool isn't in the GitHub catalog");
    }
    const { owner, repo } = parsedSlug;
    const repositoryFullName = `${owner}/${repo}`;

    try {
      const env = getEnv(c.env);
      const supabase = getSupabase(env);
      const result = await recordGithubToolNomination(supabase, {
        repositoryFullName,
        repositoryUrl: `https://github.com/${repositoryFullName}`,
        requestedBy: user.id,
      });

      return c.json({ status: result === "created" ? "queued" : "already-queued" }, 200);
    } catch (err) {
      logger.error("github_tool_nomination_failed", {
        error: err instanceof Error ? err.message : String(err),
        repositoryFullName,
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 500, "internal_error", "Couldn't submit this nomination right now");
    }
  },
);