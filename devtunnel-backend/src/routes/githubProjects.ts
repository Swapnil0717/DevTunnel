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
  GitHubRepoError,
  type GitHubRepoCatalogSummary,
} from "../lib/githubRepo";
import { mapGithubTopicsToTechStack } from "../lib/techTopics";
import { recordGithubProjectNomination } from "../db/githubProjectNominations";
import type { Env, Variables, GithubIssueSummary } from "../types";

/**
 * Contributor — GitHub Projects (`/github-projects` — "GitHub Projects"
 * in `AppSidebar`, devtunnel-frontend's `lib/github-projects/{types,api}.ts`).
 * Mounted on the app root in src/index.ts (`app.route("/", githubProjects)`)
 * — reachable by any signed-in contributor, not just admins.
 *
 * Deliberately NOT the same data source as `/projects` ("Projects on
 * DevTunnel", src/routes/admin's onboarded-project tables): this route
 * never touches Supabase for reading repository data. It's a live,
 * GitHub-wide catalog of real open-source repositories — "every GitHub
 * project", not just the handful DevTunnel has onboarded. The actual
 * scan/cache/paginate/map logic for the list is shared with the sibling
 * `GET /github-open-source-tools` route (src/routes/githubOpenSourceTools.ts)
 * via `lib/githubCatalog.ts` — see that module's doc comment for the
 * full reasoning on the `GITHUB_DISCOVERY_TOKEN` credential choice and
 * the cache-then-paginate shape. This file only supplies what's
 * specific to *this* catalog: its discovery query, its own cache key,
 * and the two single-repository routes below.
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

/**
 * Soft/hard TTL for one repository's detail-view cache slot. Shorter
 * than the 30-minute catalog TTL (`lib/githubCatalog.ts`
 * `CATALOG_CACHE_SOFT_TTL_SECONDS`) on purpose: a single-repository
 * lookup is a handful of GitHub calls (repo metadata + README + issues +
 * contributor count), not a several-hundred-repo scan, so it's cheap
 * enough to refresh more often — a contributor reading a project's
 * Issues tab shouldn't be looking at an hour-old open-issue list.
 */
const DETAIL_CACHE_SOFT_TTL_SECONDS = 10 * 60;
const DETAIL_CACHE_HARD_TTL_SECONDS = DETAIL_CACHE_SOFT_TTL_SECONDS * 3;

/**
 * Reverses the catalog's own slug encoding (`lib/githubCatalog.ts`
 * `toSummary`: `item.full_name.toLowerCase().replace("/", "--")`).
 * `full_name` always contains exactly one `/`, so `String.replace`
 * (no `g` flag) only ever swaps that single character for `--` — the
 * inverse is just splitting on the *first* `--`, never a repo name's
 * own internal hyphens. Returns `null` for a slug that doesn't contain
 * that separator at all, which the caller treats as `not-found` rather
 * than guessing at a malformed owner/repo pair.
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
 * Same `GithubProjectDetail` shape devtunnel-frontend's
 * `lib/github-projects/types.ts` declares — kept local to this route
 * rather than added to the shared `src/types.ts` because nothing else
 * in this backend needs it (Backend_Development_Rules.txt rule 51:
 * centralize what's actually cross-cutting, not everything that could
 * theoretically be reused).
 */
interface GithubProjectIssuePreview {
  id: string;
  number: number;
  title: string;
  url: string;
  labels: string[];
  commentCount: number;
  createdAt: string;
}

interface GithubProjectDetailPayload {
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
  openIssues: GithubProjectIssuePreview[];
}

function toIssuePreview(issue: GithubIssueSummary): GithubProjectIssuePreview {
  return {
    // GitHub issue numbers are only unique within one repository, not
    // globally — `url` doubles as a stable per-repository-scoped id
    // here since this preview has no database row of its own to key on.
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
 * "first page only" posture `fetchRepositoryIssues`'s own default takes
 * for Task Onboarding's issue picker (src/lib/githubRepo.ts), not the
 * full-backlog walk `fetchAllRepositoryIssues` does for New Issue
 * Detection. This is a read-only preview a contributor browses before
 * clicking through to GitHub itself, not a scan that has to see every
 * open issue to be correct.
 */
const DETAIL_ISSUES_LIMIT = 30;

/**
 * `GET /github-projects/:slug` — backs the Project Detail page
 * (`/github-projects/:slug`), the destination `GithubProjectCard` links
 * to instead of opening straight out to GitHub. Fetches the
 * repository's own metadata, README, open issues, and true contributor
 * count directly from GitHub (via `GITHUB_DISCOVERY_TOKEN`, the same
 * server-controlled credential the catalog scan already uses — never a
 * signed-in contributor's own GitHub token, since browsing this catalog
 * never requires the contributor to have connected GitHub at all) and
 * caches the combined result per-repository.
 *
 * A slug that doesn't decode to a plausible `owner/repo` pair, or a
 * repository GitHub reports as not found, both respond 404 — the
 * frontend's `getGithubProjectBySlug` (`lib/github-projects/api.ts`)
 * treats both the same way (`notFound()`), so there's no need to
 * distinguish them on the wire.
 */
githubProjects.get("/github-projects/:slug", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "github-projects-detail",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsedSlug = slugToOwnerRepo(slug);
  if (!parsedSlug) {
    return errorResponse(c, 404, "not_found", "This project isn't in the GitHub catalog");
  }
  const { owner, repo } = parsedSlug;

  try {
    const payload = await withCacheSWR<GithubProjectDetailPayload>(
      c.executionCtx,
      c.env,
      `github-project-detail:${owner.toLowerCase()}--${repo.toLowerCase()}:v1`,
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
      return errorResponse(c, 500, "internal_error", "Couldn't load this project right now");
    }

    return c.json(payload, 200);
  } catch (err) {
    if (err instanceof GitHubRepoError) {
      if (err.reason === "not_found") {
        return errorResponse(c, 404, "not_found", "This project isn't in the GitHub catalog");
      }
      if (err.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", err.message);
      }
      logger.error("github_project_detail_github_error", {
        reason: err.reason,
        owner,
        repo,
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now");
    }

    logger.error("github_project_detail_failed", {
      error: err instanceof Error ? err.message : String(err),
      owner,
      repo,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load this project right now");
  }
});

/**
 * `POST /github-projects/:slug/request-onboarding` — the Project Detail
 * page's "Nominate for DevTunnel" action
 * (`RequestOnboardingButton`, devtunnel-frontend
 * `components/github-projects/request-onboarding-button.tsx`).
 *
 * This never onboards the repository itself — it only records that a
 * signed-in contributor thinks the repository is worth an Admin running
 * the real, multi-step Project Onboarding flow (sql/006) on, which still
 * needs a human to pick roles, difficulty, and tech-stack categorization
 * no automated call could responsibly guess. `recordGithubProjectNomination`
 * (`db/githubProjectNominations.ts`) de-duplicates against a repository
 * that's already awaiting review (sql/023's partial unique index) rather
 * than piling up repeat rows — either outcome ("created" or
 * "already-pending") is reported back the same reassuring way, since
 * from the contributor's side both mean "an admin will see this".
 *
 * The slug only needs to decode to a plausible `owner/repo` pair here —
 * unlike the detail route above, this never calls GitHub itself to
 * confirm the repository still exists, since a nomination for a
 * repository that's since gone private or been deleted is still
 * harmless for an Admin to see and dismiss.
 */
githubProjects.post("/github-projects/:slug/request-onboarding", requireAuth, async (c) => {
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "github-projects-nominate",
    limit: 10,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsedSlug = slugToOwnerRepo(slug);
  if (!parsedSlug) {
    return errorResponse(c, 404, "not_found", "This project isn't in the GitHub catalog");
  }
  const { owner, repo } = parsedSlug;
  const repositoryFullName = `${owner}/${repo}`;

  try {
    const env = getEnv(c.env);
    const supabase = getSupabase(env);
    const result = await recordGithubProjectNomination(supabase, {
      repositoryFullName,
      repositoryUrl: `https://github.com/${repositoryFullName}`,
      requestedBy: user.id,
    });

    return c.json({ status: result === "created" ? "queued" : "already-queued" }, 200);
  } catch (err) {
    logger.error("github_project_nomination_failed", {
      error: err instanceof Error ? err.message : String(err),
      repositoryFullName,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't submit this nomination right now");
  }
});