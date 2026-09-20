import type { Context } from "hono";
import type { Env, Variables, GithubIssueSummary } from "../types";
import { getEnv, type ValidatedEnv } from "../config/env";
import { checkRateLimit } from "./rateLimit";
import { errorResponse } from "./response";
import { logger } from "./logger";
import { withCacheSWR } from "./cache";
import { fetchRepositoryIssueListing, GitHubRepoError } from "./githubRepo";

/**
 * "Load all issues" for the four contributor-facing detail pages:
 *
 *  - `GET /github-projects/:slug/issues`
 *  - `GET /github-open-source-tools/:slug/issues`
 *  - `GET /projects/:slug/issues`
 *  - `GET /opensource-tools/:slug/issues`
 *
 * Each of those pages' own detail route (`GET .../:slug`) deliberately
 * ships only the first 30–50 open issues as a preview, so the page loads
 * fast whatever the repository's backlog looks like. These routes are the
 * other half: the same repository's *complete* open-issue list, fetched
 * only when a contributor actually asks for it.
 *
 * All four routes share this one module instead of each carrying its own
 * copy of the fetch/cache/error-mapping flow, because that flow is
 * identical — the only genuinely per-route parts are how a `:slug`
 * resolves to a GitHub repository (the two GitHub-catalog routes decode
 * it from the slug itself; the two DevTunnel routes look it up in
 * Supabase) and what shape each row is returned in (`mapIssue`), which is
 * what `RepositoryIssuesRouteConfig` supplies.
 *
 * Returns the whole list (up to the walk's cap — see
 * `fetchRepositoryIssueListing`) in one response rather than paging it
 * server-side: the frontend paginates in the browser over the loaded
 * list, the same "fetch once, page client-side" shape every other list in
 * that app uses (`usePagePagination`), and it keeps search/filter working
 * across the whole backlog instead of just the visible page.
 */

/** A listed issue — `GithubIssueSummary` minus `body`, which no list row renders. */
export type ListedIssue = Omit<GithubIssueSummary, "body">;

interface CachedIssueListing {
  issues: ListedIssue[];
  truncated: boolean;
}

/**
 * Same 10-minute soft TTL the detail routes use for their own GitHub
 * snapshots (see `GET /github-projects/:slug`): fresh enough that a
 * contributor isn't reading an hour-old backlog, cheap enough that a
 * burst of "Load all" clicks on the same repository costs GitHub one
 * walk rather than one per click.
 */
const LISTING_CACHE_SOFT_TTL_SECONDS = 10 * 60;
const LISTING_CACHE_HARD_TTL_SECONDS = LISTING_CACHE_SOFT_TTL_SECONDS * 3;

/** Per-user ceiling; a cache miss costs up to ~10 GitHub calls, so this is deliberately modest. */
const ISSUES_RATE_LIMIT_PER_MINUTE = 20;

function stripBody(issue: GithubIssueSummary): ListedIssue {
  const { body: _body, ...rest } = issue;
  return rest;
}

/**
 * Cached, body-less list of one repository's open issues. Keyed by
 * repository alone — the list is identical for every viewer and for
 * every page that can show it (a repository that's both in the GitHub
 * catalog and onboarded to DevTunnel shares one entry), and it's read
 * with `GITHUB_DISCOVERY_TOKEN` rather than the viewer's own token so
 * browsing never requires the contributor to have connected GitHub.
 */
async function getRepositoryIssueListing(
  ctx: Pick<ExecutionContext, "waitUntil">,
  rawEnv: Env,
  env: ValidatedEnv,
  owner: string,
  repo: string,
): Promise<CachedIssueListing | null> {
  return withCacheSWR<CachedIssueListing>(
    ctx,
    rawEnv,
    `repo-open-issues:${owner.toLowerCase()}/${repo.toLowerCase()}:v1`,
    {
      softTtlSeconds: LISTING_CACHE_SOFT_TTL_SECONDS,
      hardTtlSeconds: LISTING_CACHE_HARD_TTL_SECONDS,
    },
    async () => {
      const listing = await fetchRepositoryIssueListing(env.GITHUB_DISCOVERY_TOKEN, owner, repo);
      return { issues: listing.issues.map(stripBody), truncated: listing.truncated };
    },
  );
}

export interface ResolvedRepository<Ctx> {
  owner: string;
  repo: string;
  /** Whatever `mapIssue` needs from the resolution step — e.g. the onboarded project's name and tech stack. */
  context: Ctx;
}

export interface RepositoryIssuesRouteConfig<Ctx, Row> {
  /** Logical name for the rate-limit bucket and log lines, e.g. `"github-projects"`. */
  name: string;
  /**
   * Turns the route's `:slug` into a GitHub repository. `"not_found"` for
   * a slug that matches nothing; `"no_repository"` for a real DevTunnel
   * entry whose source isn't a GitHub repository (a tool hosted on a docs
   * site) — a permanent property of the entry rather than a lookup miss,
   * so it gets its own status, same as the star routes' `no_repository`.
   */
  resolve: (
    slug: string,
    env: ValidatedEnv,
  ) => Promise<ResolvedRepository<Ctx> | "not_found" | "no_repository">;
  notFoundMessage: string;
  /** Maps one listed issue to this route's response row — the same row shape its detail route already returns. */
  mapIssue: (issue: ListedIssue, context: Ctx) => Row;
}

/**
 * Shared handler behind the four `.../:slug/issues` routes. `slug` is
 * passed in rather than read off `c` so each route's own path typing
 * supplies it as a plain `string`.
 *
 * Response: `{ issues: Row[], truncated: boolean }`. `truncated` is
 * `true` when the repository has more open issues than the walk's cap,
 * so the frontend can point the reader at GitHub for the remainder
 * instead of implying the list is complete.
 */
export async function handleRepositoryIssuesRequest<Ctx, Row>(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  slug: string,
  config: RepositoryIssuesRouteConfig<Ctx, Row>,
) {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  // Counted per signed-in user rather than per IP — same reasoning
  // `handleCatalogListRequest` documents for its own bucket.
  const withinLimit = await checkRateLimit(c, {
    bucket: `${config.name}-issues`,
    limit: ISSUES_RATE_LIMIT_PER_MINUTE,
    windowSeconds: 60,
    identity: `user:${user.id}`,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const resolved = await config.resolve(slug, env);
    if (resolved === "not_found") {
      return errorResponse(c, 404, "not_found", config.notFoundMessage);
    }
    if (resolved === "no_repository") {
      return errorResponse(
        c,
        409,
        "no_repository",
        "This entry isn't hosted on GitHub, so there's no issue list to load",
      );
    }

    const listing = await getRepositoryIssueListing(
      c.executionCtx,
      c.env,
      env,
      resolved.owner,
      resolved.repo,
    );
    if (!listing) {
      return errorResponse(c, 500, "internal_error", "Couldn't load issues right now");
    }

    return c.json(
      {
        issues: listing.issues.map((issue) => config.mapIssue(issue, resolved.context)),
        truncated: listing.truncated,
      },
      200,
    );
  } catch (err) {
    if (err instanceof GitHubRepoError) {
      if (err.reason === "not_found") {
        return errorResponse(c, 404, "not_found", config.notFoundMessage);
      }
      if (err.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", err.message);
      }
      logger.error("repository_issues_github_error", {
        route: config.name,
        reason: err.reason,
        slug,
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now");
    }

    logger.error("repository_issues_failed", {
      route: config.name,
      error: err instanceof Error ? err.message : String(err),
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load issues right now");
  }
}