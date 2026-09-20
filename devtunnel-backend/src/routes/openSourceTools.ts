import { Hono } from "hono";
import type { Env, Variables, GithubIssueSummary, OnboardingGithubIdentity } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { withCacheSWR } from "../lib/cache";
import {
  getOpenSourceToolDetailBySlug,
  listAvailableOpenSourceTools,
} from "../db/openSourceTools";
import { listTasks } from "../db/tasks";
import { isOpenSourceToolContributor, joinOpenSourceTool } from "../db/catalogMemberships";
import { applyCatalogStar, readCatalogStarStatus } from "../lib/catalogStar";
import {
  fetchRepositoryCatalogSummary,
  fetchRepositoryContributorCount,
  fetchRepositoryIssues,
} from "../lib/githubRepo";
import { handleRepositoryIssuesRequest, type ListedIssue } from "../lib/repoIssuesList";

/**
 * Contributor — Open Source Tools on DevTunnel (`/opensource-tools` —
 * "Open Source Tools on Devtunnel" in `AppSidebar`/`AppBottomNav`).
 * Mounted on the app root in src/index.ts (`app.route("/", openSourceTools)`),
 * same convention as `/projects`/`/tasks`/`/github-open-source-tools` —
 * reachable by any signed-in contributor, not just admins.
 *
 * Distinct from `GET /github-open-source-tools`
 * (src/routes/githubOpenSourceTools.ts): this is DevTunnel's own curated
 * catalog — see src/db/openSourceTools.ts's doc comment for the full
 * data-source distinction.
 *
 * ROUTE ORDER MATTERS: the literal `/opensource-tools/available` must
 * stay declared before `/opensource-tools/:slug`, or Hono matches
 * "available" as a slug and the catalog request 404s. Same note as
 * src/routes/projects.ts.
 */
export const openSourceTools = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * `GET /opensource-tools/available` — every published DevTunnel open
 * source tool, newest first. This is the one real endpoint
 * `devtunnel-frontend/src/lib/opensource-tools/api.ts`'s
 * `getOpenSourceTools` calls for the `/opensource-tools` page — the same
 * "flagged as not-yet-confirmed, built directly off the published
 * `devtunnel.opensource_tools` columns" contract that file's own doc
 * comment describes, now backed by a real route.
 *
 * `requireAuth` only — no admin role required, same reasoning
 * `GET /projects/available`/`GET /tasks`/`GET /issues` already document
 * for themselves: browsing DevTunnel's tool catalog is not an admin
 * action.
 *
 * Response body is the raw `OpenSourceToolSummary[]` array — NOT wrapped
 * in the `{ data: ... }` envelope (src/lib/response.ts) — matching the
 * already-shipped frontend contract (`getOpenSourceTools` parses the body
 * directly as `OpenSourceToolSummary[]`), the same documented exception
 * every other list route in this backend uses. Error responses still use
 * the standard `{ error: { code, message, requestId } }` envelope.
 */
openSourceTools.get("/opensource-tools/available", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    // requireAuth already guarantees this — kept for type safety, same
    // pattern used throughout this backend's protected routes.
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  // Cheap indexed-table read, same generous per-minute budget
  // `GET /projects/available`/`GET /tasks` apply to their own list reads.
  const withinLimit = await checkRateLimit(c, {
    bucket: "opensource-tools-available-list",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);
    const list = await listAvailableOpenSourceTools(supabase);
    return c.json(list, 200);
  } catch (err) {
    logger.error("opensource_tools_available_list_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load open source tools right now");
  }
});

/* ---------------------------------------------------------------------------
 * Tool Detail — `/opensource-tools/:toolSlug`
 * (devtunnel-frontend's `lib/opensource-tools/{types,api,client-api}.ts`).
 * ------------------------------------------------------------------------ */

/**
 * The GitHub half of a tool's detail payload, cached per repository.
 *
 * Every field here exists only when the tool's `source_url` resolves to a
 * real GitHub repository — `devtunnel.opensource_tools` (sql/017) stores
 * no stars, forks, license, or maintainer of its own, and a tool's home
 * can legitimately be a docs site. When there's no repository, or GitHub
 * can't be reached, the payload's `repository` comes back `null` and the
 * frontend hides the whole GitHub block rather than rendering zeroes that
 * look like real counts (rule 38).
 */
interface ToolGithubSnapshot {
  fullName: string;
  url: string;
  owner: OnboardingGithubIdentity;
  stars: number;
  forks: number;
  openIssuesCount: number;
  contributorCount: number;
  license: string | null;
  pushedAt: string;
  issues: GithubIssueSummary[];
}

/** Same TTLs as the project detail route, for the same reasons. */
const DETAIL_CACHE_SOFT_TTL_SECONDS = 10 * 60;
const DETAIL_CACHE_HARD_TTL_SECONDS = DETAIL_CACHE_SOFT_TTL_SECONDS * 3;

/** First-page-only issue preview, same posture `GET /github-projects/:slug` takes. */
const DETAIL_ISSUES_LIMIT = 50;

/**
 * Upper bound on tasks returned with a tool — same reasoning and same
 * value as `GET /projects/:slug`'s own `DETAIL_TASKS_LIMIT` (this route's
 * linked shadow project is a real `devtunnel.projects` row, so its task
 * count behaves exactly like any other project's).
 */
const DETAIL_TASKS_LIMIT = 200;

/**
 * `GET /opensource-tools/:slug` — backs the Tool Detail page, the
 * destination `DevtunnelOpenSourceToolCard` should link to instead of
 * sending every click straight out to the tool's own site.
 *
 * Three sources, same separation the project detail route keeps:
 *  1. **Supabase** — the curated tool: resolved description, labels,
 *     imported README, and the Admin-authored setup guide (sql/017's
 *     `setup_guide`, the one thing this catalog has that no other page in
 *     the app does).
 *  2. **GitHub, cached** — the `repository` block and open-issue list,
 *     only when `source_url` resolves to a repository.
 *  3. **Per viewer, uncached** — star status and membership.
 *
 * A tool whose source isn't a GitHub repository, and a tool whose
 * repository GitHub couldn't be reached for, both return
 * `repository: null` with an empty `openIssues`. Those two cases are
 * genuinely different, and the payload deliberately doesn't distinguish
 * them: either way there is no repository data to show right now, and
 * inventing a "GitHub is temporarily down" state the frontend would have
 * to render differently buys nothing a retry doesn't already fix.
 */
openSourceTools.get("/opensource-tools/:slug", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "opensource-tools-detail",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);

    const tool = await getOpenSourceToolDetailBySlug(supabase, slug);
    if (!tool) {
      return errorResponse(c, 404, "not_found", "This tool isn't on DevTunnel");
    }

    const repositoryFullName = tool.repo ? `${tool.repo.owner}/${tool.repo.repo}` : null;

    const [snapshot, tasksPage, starStatus, viewerIsContributing] = await Promise.all([
      tool.repo
        ? withCacheSWR<ToolGithubSnapshot>(
            c.executionCtx,
            c.env,
            `opensource-tool-detail-github:${repositoryFullName!.toLowerCase()}:v1`,
            {
              softTtlSeconds: DETAIL_CACHE_SOFT_TTL_SECONDS,
              hardTtlSeconds: DETAIL_CACHE_HARD_TTL_SECONDS,
            },
            async () => {
              const { owner, repo } = tool.repo!;
              // `GITHUB_DISCOVERY_TOKEN` — shared cache slot, identical
              // for every viewer, and reading a public repository must
              // not require the contributor to have connected GitHub.
              const [summary, contributorCount, issues] = await Promise.all([
                fetchRepositoryCatalogSummary(env.GITHUB_DISCOVERY_TOKEN, owner, repo),
                fetchRepositoryContributorCount(env.GITHUB_DISCOVERY_TOKEN, owner, repo),
                fetchRepositoryIssues(
                  env.GITHUB_DISCOVERY_TOKEN,
                  owner,
                  repo,
                  DETAIL_ISSUES_LIMIT,
                ),
              ]);

              return {
                fullName: summary.fullName,
                url: summary.htmlUrl,
                owner: summary.owner,
                stars: summary.stars,
                forks: summary.forks,
                openIssuesCount: summary.openIssues,
                contributorCount,
                license: summary.license,
                pushedAt: summary.pushedAt,
                issues,
              };
            },
          ).catch((err) => {
            logger.error("opensource_tool_detail_github_snapshot_failed", {
              error: err instanceof Error ? err.message : String(err),
              slug,
              requestId: c.get("requestId"),
            });
            return null;
          })
        : Promise.resolve(null),
      // `null` for a tool onboarded before sql/034 — it has no linked
      // project yet, so there's nowhere to read tasks from (same "no
      // record to hang a task off" reasoning the Contribute page's Tasks
      // panel already documents for this exact case).
      tool.projectSlug
        ? listTasks(supabase, { limit: DETAIL_TASKS_LIMIT, before: null, projectSlug: tool.projectSlug })
        : Promise.resolve({ tasks: [], nextCursor: null }),
      repositoryFullName
        ? readCatalogStarStatus(env, repositoryFullName, user.id)
        : Promise.resolve({ starredByViewer: false, localStarCount: 0 }),
      isOpenSourceToolContributor(supabase, tool.id, user.id),
    ]);

    const response = {
      id: tool.id,
      slug: tool.slug,
      name: tool.name,
      description: tool.description,
      sourceUrl: tool.sourceUrl,
      primaryLanguage: tool.primaryLanguage,
      labels: tool.labels,
      createdAt: tool.createdAt,

      readme: tool.readme,
      setupGuide: tool.setupGuide,

      repository: snapshot
        ? {
            fullName: snapshot.fullName,
            url: snapshot.url,
            owner: snapshot.owner,
            stars: snapshot.stars,
            forks: snapshot.forks,
            openIssuesCount: snapshot.openIssuesCount,
            contributorCount: snapshot.contributorCount,
            license: snapshot.license,
            pushedAt: snapshot.pushedAt,
          }
        : null,

      // Same `GithubProjectIssuePreview` shape `GET /github-projects/:slug`
      // returns, which is what the frontend's `OpenSourceToolIssuePreview`
      // aliases. This is only the first `DETAIL_ISSUES_LIMIT` of them;
      // `GET /opensource-tools/:slug/issues` below returns the rest, in
      // this same row shape.
      openIssues: (snapshot?.issues ?? []).map(toToolIssuePreview),

      // This tool's DevTunnel tasks, read off its linked shadow project
      // (sql/034) — `[]` (never a fabricated error) for a pre-sql/034
      // tool that has no linked project. `linkedProjectSlug` is what the
      // frontend's Tasks tab needs to build each task's real URL
      // (`/projects/:projectSlug/tasks/:taskId` — tasks are always a
      // project route, even when reached from a tool's page).
      tasks: tasksPage.tasks,
      linkedProjectSlug: tool.projectSlug,

      isStarredByViewer: starStatus.starredByViewer,
      localStarCount: starStatus.localStarCount,
      viewerIsContributing,
    };

    return c.json(response, 200);
  } catch (err) {
    logger.error("opensource_tool_detail_failed", {
      error: err instanceof Error ? err.message : String(err),
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load this tool right now");
  }
});

/**
 * One GitHub issue as the frontend's `OpenSourceToolIssuePreview` row.
 * `url` doubles as the id — GitHub issue numbers are only unique within
 * one repository, and this preview has no database row of its own to key
 * on. Shared by the detail route's first-page preview and the "Load all
 * issues" route below so the two can never drift apart.
 */
function toToolIssuePreview(issue: ListedIssue) {
  return {
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
 * `GET /opensource-tools/:slug/issues` — the All Issues tab's "Load all
 * issues" action: the tool repository's complete open-issue list (up to
 * the shared cap) rather than the first `DETAIL_ISSUES_LIMIT` the detail
 * route ships. `409 no_repository` for a tool whose source isn't a GitHub
 * repository — the frontend never calls it in that case (the tab shows
 * "No issue tracker to show" instead), so it's a guard against a
 * hand-made request, same as the star routes. Shared fetch/cache/error-
 * mapping flow: `lib/repoIssuesList.ts`.
 */
openSourceTools.get("/opensource-tools/:slug/issues", requireAuth, (c) =>
  handleRepositoryIssuesRequest(c, c.req.param("slug"), {
    name: "opensource-tools",
    notFoundMessage: "This tool isn't on DevTunnel",
    resolve: async (slug, env) => {
      const tool = await getOpenSourceToolDetailBySlug(getSupabase(env), slug);
      if (!tool) return "not_found";
      if (!tool.repo) return "no_repository";
      return { ...tool.repo, context: null };
    },
    mapIssue: (issue) => toToolIssuePreview(issue),
  }),
);

/**
 * Resolves the tool's GitHub repository for the two star routes.
 * Distinguishes "no such tool" from "this tool isn't on GitHub" so the
 * handlers can say which — the second is a permanent property of the
 * tool, not a lookup failure, and a contributor who somehow reached the
 * star action for a docs-site tool deserves to be told that rather than
 * a misleading 404.
 */
type ToolStarTarget =
  | { status: "ok"; owner: string; repo: string }
  | { status: "not_found" }
  | { status: "no_repository" };

async function resolveToolStarTarget(
  env: ReturnType<typeof getEnv>,
  slug: string,
): Promise<ToolStarTarget> {
  const tool = await getOpenSourceToolDetailBySlug(getSupabase(env), slug);
  if (!tool) return { status: "not_found" };
  if (!tool.repo) return { status: "no_repository" };
  return { status: "ok", ...tool.repo };
}

/**
 * `PUT /opensource-tools/:slug/star` — the Tool Detail page's Star
 * button. Stars the repository on the contributor's own real GitHub
 * account, then records the local `github_stars` row; the shared sequence
 * lives in `lib/catalogStar.ts`.
 *
 * Writes the same `github_stars` table keyed by `repository_full_name`
 * that `PUT /github-open-source-tools/:slug/star` does — deliberate, for
 * the same reason the two project star routes share it: a repository
 * starred from DevTunnel's curated Tool page and from the GitHub tool
 * catalog is the same star, and a contributor shouldn't see it on one
 * page and not the other.
 *
 * `409 no_repository` for a tool that isn't hosted on GitHub. The
 * frontend doesn't render the Star button in that case at all, so this
 * is a guard against a hand-made request rather than a path the UI takes
 * (rule 10: the backend is the final boundary, regardless of what the UI
 * makes reachable).
 */
openSourceTools.put("/opensource-tools/:slug/star", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "opensource-tools-star",
    limit: 30,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const target = await resolveToolStarTarget(env, slug);
    if (target.status === "not_found") {
      return errorResponse(c, 404, "not_found", "This tool isn't on DevTunnel");
    }
    if (target.status === "no_repository") {
      return errorResponse(c, 409, "no_repository", "This tool has no GitHub repository to star");
    }

    const result = await applyCatalogStar(env, {
      userId: user.id,
      owner: target.owner,
      repo: target.repo,
      action: "star",
    });

    if (result.status === "reauth_required") {
      return errorResponse(
        c,
        403,
        "github_reauth_required",
        "Reconnect your GitHub account to star this tool",
      );
    }

    if (result.status === "github_error") {
      const { error } = result;
      if (error.reason === "not_found") {
        return errorResponse(c, 404, "not_found", "This tool's repository is no longer on GitHub");
      }
      if (error.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", error.message);
      }
      logger.error("opensource_tool_star_github_error", {
        reason: error.reason,
        slug,
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now");
    }

    return c.json(result.star, 200);
  } catch (err) {
    logger.error("opensource_tool_star_failed", {
      error: err instanceof Error ? err.message : String(err),
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't star this tool right now");
  }
});

/** `DELETE /opensource-tools/:slug/star` — the reverse of the `PUT` above, same error handling. */
openSourceTools.delete("/opensource-tools/:slug/star", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "opensource-tools-star",
    limit: 30,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const target = await resolveToolStarTarget(env, slug);
    if (target.status === "not_found") {
      return errorResponse(c, 404, "not_found", "This tool isn't on DevTunnel");
    }
    if (target.status === "no_repository") {
      return errorResponse(c, 409, "no_repository", "This tool has no GitHub repository to unstar");
    }

    const result = await applyCatalogStar(env, {
      userId: user.id,
      owner: target.owner,
      repo: target.repo,
      action: "unstar",
    });

    if (result.status === "reauth_required") {
      return errorResponse(
        c,
        403,
        "github_reauth_required",
        "Reconnect your GitHub account to unstar this tool",
      );
    }

    if (result.status === "github_error") {
      const { error } = result;
      if (error.reason === "not_found") {
        return errorResponse(c, 404, "not_found", "This tool's repository is no longer on GitHub");
      }
      if (error.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", error.message);
      }
      logger.error("opensource_tool_unstar_github_error", {
        reason: error.reason,
        slug,
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now");
    }

    return c.json(result.star, 200);
  } catch (err) {
    logger.error("opensource_tool_unstar_failed", {
      error: err instanceof Error ? err.message : String(err),
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't unstar this tool right now");
  }
});

/**
 * `POST /opensource-tools/:slug/contribute` — the Tool Detail page's
 * primary action.
 *
 * Records the contributor in `devtunnel.opensource_tool_contributors`
 * (sql/026) and nothing more. Deliberately weaker than the project
 * equivalent, because a tool genuinely is a weaker thing to join:
 * DevTunnel curates tools for contributors to *use*, and has no tasks or
 * roles attached to them (`devtunnel.tasks` hangs off a project, not a
 * tool), so the real work still happens in the tool's own repository.
 *
 * That's also why this doesn't require completed onboarding, where
 * `POST /projects/:slug/contribute` does: there's no task matching for a
 * tool that an incomplete profile would break, so gating it would block
 * something harmless for no gain.
 *
 * Idempotent, same as the project route. Returns just `{ contributing }`
 * — there's no contributor count on this catalog to keep in sync, since
 * `devtunnel.opensource_tools` tracks no delivered work of its own.
 */
openSourceTools.post("/opensource-tools/:slug/contribute", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "opensource-tools-contribute",
    limit: 20,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);
    const tool = await getOpenSourceToolDetailBySlug(supabase, slug);
    if (!tool) {
      return errorResponse(c, 404, "not_found", "This tool isn't on DevTunnel");
    }

    await joinOpenSourceTool(supabase, tool.id, user.id);

    return c.json({ contributing: true }, 200);
  } catch (err) {
    logger.error("opensource_tool_contribute_failed", {
      error: err instanceof Error ? err.message : String(err),
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't register your interest right now");
  }
});