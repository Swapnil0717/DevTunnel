import { Hono } from "hono";
import type { Context } from "hono";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { fetchRepositoryCatalogSummary, GitHubRepoError } from "../lib/githubRepo";
import {
  isGithubRepoContributor,
  joinGithubRepo,
  toRepositoryKey,
  type GithubCatalog,
} from "../db/githubRepoContributors";

/**
 * Contributor — the **Contribute** button on the two raw GitHub catalog
 * detail pages (`/github-projects/:slug` and `/github-open-source-tools/:slug`
 * in devtunnel-frontend, `ContributeToRepoButton`).
 *
 * Until now that button was a plain link: it opened the Contribute page and
 * recorded nothing, so a contributor who clicked it left no trace on their
 * profile. These routes are the recording half. They are the GitHub-catalog
 * counterpart of `POST /projects/:slug/contribute` and
 * `POST /opensource-tools/:slug/contribute` (src/routes/projects.ts,
 * src/routes/openSourceTools.ts), and they mean the same thing — "I said I
 * want to work on this", never delivered work (see sql/036's header).
 *
 * Mounted on the app root in src/index.ts. No path conflicts: the existing
 * `/github-projects/:slug/*` routes are `issues`, `star` and
 * `request-onboarding`, none of which is `contribute` or `contribute-status`.
 *
 * ---------------------------------------------------------------------
 * Where the repository's name comes from
 *
 * The catalog slug (`owner--repo`, lower-cased) says *which* repository, but
 * loses GitHub's casing, and nothing stops a caller from posting a slug for
 * a repository that doesn't exist. So on the first join the repository is
 * resolved through GitHub (`fetchRepositoryCatalogSummary`, the same call
 * the detail page makes) and the name and URL it reports are what get
 * stored — the client never supplies either. A repeat join (the common
 * double-click / returning-contributor case) is answered from the local
 * table without touching GitHub at all.
 *
 * The lookup uses the shared `GITHUB_DISCOVERY_TOKEN`, not the viewer's own:
 * joining must not require the contributor to have connected GitHub, and
 * reading a public repository's metadata needs no user credential (same
 * choice `GET /projects/:slug/contribute` documents).
 *
 * Unlike joining an onboarded DevTunnel project, this does NOT require
 * completed onboarding: that gate exists because task matching depends on
 * it, and a raw GitHub repository has no DevTunnel tasks to match.
 * ---------------------------------------------------------------------
 */
export const githubCatalogContribute = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Reverses the catalog's own slug encoding (`lib/githubCatalog.ts`
 * `toSummary`: `full_name.toLowerCase().replace("/", "--")`). Identical to
 * the private helper in `routes/githubProjects.ts` and
 * `routes/githubOpenSourceTools.ts`, duplicated here for the same reason
 * they duplicate it between themselves: it is a small pure function and the
 * routes keep their own specifics local rather than centralized.
 */
function slugToOwnerRepo(slug: string): { owner: string; repo: string } | null {
  const separatorIndex = slug.indexOf("--");
  if (separatorIndex === -1) return null;
  const owner = slug.slice(0, separatorIndex);
  const repo = slug.slice(separatorIndex + 2);
  if (!owner || !repo) return null;
  return { owner, repo };
}

type RouteContext = Context<{ Bindings: Env; Variables: Variables }>;

const NOT_FOUND_MESSAGE: Record<GithubCatalog, string> = {
  project: "This project isn't in the GitHub catalog",
  tool: "This tool isn't in the GitHub catalog",
};

async function handleJoin(c: RouteContext, catalog: GithubCatalog): Promise<Response> {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  const withinLimit = await checkRateLimit(c, {
    bucket: "github-catalog-contribute",
    limit: 20,
    windowSeconds: 60,
    identity: `user:${user.id}`,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsedSlug = slugToOwnerRepo(c.req.param("slug") ?? "");
  if (!parsedSlug) {
    return errorResponse(c, 404, "not_found", NOT_FOUND_MESSAGE[catalog]);
  }
  const { owner, repo } = parsedSlug;
  const repositoryKey = toRepositoryKey(owner, repo);

  try {
    const supabase = getSupabase(env);

    // Already joined: nothing to resolve or write, and no GitHub request.
    if (await isGithubRepoContributor(supabase, user.id, catalog, repositoryKey)) {
      return c.json({ contributing: true }, 200);
    }

    const summary = await fetchRepositoryCatalogSummary(env.GITHUB_DISCOVERY_TOKEN, owner, repo);

    await joinGithubRepo(supabase, {
      userId: user.id,
      catalog,
      repositoryFullName: summary.fullName,
      repositoryUrl: summary.htmlUrl,
    });

    return c.json({ contributing: true }, 200);
  } catch (err) {
    if (err instanceof GitHubRepoError) {
      if (err.reason === "not_found") {
        return errorResponse(c, 404, "not_found", NOT_FOUND_MESSAGE[catalog]);
      }
      if (err.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", err.message);
      }
      logger.error("github_catalog_contribute_github_error", {
        reason: err.reason,
        owner,
        repo,
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now");
    }

    logger.error("github_catalog_contribute_failed", {
      error: err instanceof Error ? err.message : String(err),
      catalog,
      owner,
      repo,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't join this repository right now");
  }
}

/**
 * `GET …/contribute-status` — has the signed-in viewer already joined this
 * repository? Lets the detail and Contribute pages render the joined state
 * (a "Continue contributing" button, the "You've joined" line) without
 * baking a per-viewer flag into the cached, viewer-independent detail
 * payload (`GET /github-projects/:slug` caches one payload for everyone).
 *
 * Answered from the local table only — never GitHub.
 */
async function handleStatus(c: RouteContext, catalog: GithubCatalog): Promise<Response> {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  const withinLimit = await checkRateLimit(c, {
    bucket: "github-catalog-contribute-status",
    limit: 120,
    windowSeconds: 60,
    identity: `user:${user.id}`,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsedSlug = slugToOwnerRepo(c.req.param("slug") ?? "");
  if (!parsedSlug) {
    return errorResponse(c, 404, "not_found", NOT_FOUND_MESSAGE[catalog]);
  }

  try {
    const supabase = getSupabase(env);
    const contributing = await isGithubRepoContributor(
      supabase,
      user.id,
      catalog,
      toRepositoryKey(parsedSlug.owner, parsedSlug.repo),
    );
    return c.json({ contributing }, 200);
  } catch (err) {
    logger.error("github_catalog_contribute_status_failed", {
      error: err instanceof Error ? err.message : String(err),
      catalog,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't check this repository right now");
  }
}

githubCatalogContribute.post("/github-projects/:slug/contribute", requireAuth, (c) =>
  handleJoin(c, "project"),
);
githubCatalogContribute.get("/github-projects/:slug/contribute-status", requireAuth, (c) =>
  handleStatus(c, "project"),
);

githubCatalogContribute.post("/github-open-source-tools/:slug/contribute", requireAuth, (c) =>
  handleJoin(c, "tool"),
);
githubCatalogContribute.get(
  "/github-open-source-tools/:slug/contribute-status",
  requireAuth,
  (c) => handleStatus(c, "tool"),
);