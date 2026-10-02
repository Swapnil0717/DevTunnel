import { Hono } from "hono";
import { z } from "zod";
import type { Env, GithubIssueSummary, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { optionalAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { withCacheSWR } from "../lib/cache";
import { GitHubRepoError, fetchRepositoryIssue, fetchRepositoryMetadata, type GitHubRepoMetadata } from "../lib/githubRepo";
import { getProjectDetailBySlug } from "../db/projects";
import { getTaskRefForIssue } from "../db/issueDetail";

/**
 * Contributor — **View Issue** (`/issues/:projectSlug/:issueNumber` in
 * devtunnel-frontend), the page an issue on `/issues` (or a project's
 * Issues tab) opens, and the data behind its Contribute sibling
 * (`/issues/:projectSlug/:issueNumber/contribute`).
 *
 * Mounted on the app root in src/index.ts (`app.route("/", issueDetail)`),
 * next to `GET /issues` (src/routes/issues.ts). The two never collide:
 * that one is `/issues`, this one has two more path segments.
 *
 * ---------------------------------------------------------------------
 * WHAT THIS RETURNS, AND FROM WHERE
 *
 *  1. **Supabase** — the DevTunnel project (by slug) and whether a live
 *     DevTunnel task already exists for this issue.
 *  2. **GitHub, cached** — the issue itself: title, state, labels, author,
 *     and the full body. `GET /issues` deliberately ships none of that (a
 *     list of hundreds of bodies would be enormous), which is why a
 *     single-issue endpoint exists at all.
 *
 * Public, like `GET /issues` (`optionalAuth`): reading about an issue to
 * decide whether to work on it is not an action that needs an account.
 * Only the AI explanation on the page requires sign-in, and that has its
 * own endpoint (`POST /ai/issue-explanation`) — this route never calls a
 * model.
 *
 * COST: one GitHub request per cache miss, none per hit. The issue is
 * read with `GITHUB_DISCOVERY_TOKEN`, not the viewer's own token, for the
 * same reason `GET /projects/:slug/contribute` documents: the result fills
 * a cache slot shared by every viewer, and reading a public repository's
 * issue must not require the visitor to have connected GitHub. The cache
 * is `withCacheSWR` (L1 memory -> Cache API -> Supabase,
 * src/lib/cache.ts), so this adds ZERO Workers KV writes. Rate limiting
 * uses the Rate Limiting binding (src/lib/rateLimit.ts), also no KV.
 *
 * Status codes: 400 bad params · 404 unknown / archived project, or no such
 * issue (a pull request counts as "no such issue") · 429 rate limited ·
 * 502 GitHub unreachable · 200.
 *
 * Response body is the raw payload object, not the `{ data }` envelope —
 * the documented exception every contributor route here uses.
 * ---------------------------------------------------------------------
 */
export const issueDetail = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Five minutes soft: an edited title or a newly closed issue shows up
 * quickly, and a page that is open for a while never waits on GitHub.
 * Thirty minutes hard: if GitHub is briefly unreachable, a slightly old
 * copy still beats an error page.
 */
const ISSUE_CACHE_SOFT_TTL_SECONDS = 5 * 60;
const ISSUE_CACHE_HARD_TTL_SECONDS = 30 * 60;

/**
 * The GitHub-catalog slug encoding (`lib/githubCatalog.ts`): `owner--repo`,
 * lower-cased. Same decoding `routes/githubProjects.ts` uses. A slug without
 * `--` is not a catalog slug.
 */
function catalogSlugToOwnerRepo(slug: string): { owner: string; repo: string } | null {
  const separatorIndex = slug.indexOf("--");
  if (separatorIndex <= 0) return null;
  const owner = slug.slice(0, separatorIndex);
  const repo = slug.slice(separatorIndex + 2);
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(owner)) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(repo) || repo === "." || repo === "..") return null;
  return { owner, repo };
}

/** Repository facts (name, URL, language) for the issue page of a repo that isn't a DevTunnel project. */
const REPO_META_SOFT_TTL_SECONDS = 10 * 60;
const REPO_META_HARD_TTL_SECONDS = 60 * 60;

const paramsSchema = z.object({
  projectSlug: z.string().trim().min(1, "Invalid project slug").max(200, "Invalid project slug"),
  issueNumber: z.coerce
    .number()
    .int("Issue number must be a whole number")
    .positive("Issue number must be positive")
    .max(10_000_000, "Issue number is too large"),
});

/** The issue fields shared by both kinds of project. */
function toIssuePayload(issue: GithubIssueSummary) {
  return {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    state: issue.state,
    // The issue text exactly as GitHub has it — never rewritten
    // ("Do not modify the original GitHub issue", admin_workflow.txt
    // section 10). The frontend renders it through its markdown
    // component, which doesn't execute HTML.
    body: issue.body,
    labels: issue.labels,
    commentCount: issue.commentCount,
    author: issue.author,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

issueDetail.get("/issues/:projectSlug/:issueNumber", optionalAuth, async (c) => {
  const env = getEnv(c.env);
  // Public page: `user` is null for a signed-out visitor.
  const user = c.get("user");

  const params = paramsSchema.safeParse({
    projectSlug: c.req.param("projectSlug"),
    issueNumber: c.req.param("issueNumber"),
  });
  if (!params.success) {
    return errorResponse(c, 400, "invalid_request", params.error.issues[0]?.message ?? "Invalid request");
  }
  const { projectSlug, issueNumber } = params.data;

  // Counted per signed-in user when there is one, not per connecting IP:
  // the contributor's browser doesn't call this route for the first paint —
  // the Next.js frontend Worker does, on their behalf — so by IP every
  // visitor would share one bucket (see `RateLimitOptions.identity`).
  const withinLimit = await checkRateLimit(c, {
    bucket: "issue-detail",
    limit: 120,
    windowSeconds: 60,
    ...(user ? { identity: `user:${user.id}` } : {}),
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);

    // Same 404 posture as `GET /projects/:slug`: unknown, soft-deleted and
    // archived projects are one indistinguishable "this page doesn't exist".
    const project = await getProjectDetailBySlug(supabase, projectSlug, null);

    if (project?.repo) {
      const { owner, repo } = project.repo;

      const [issue, task] = await Promise.all([
        withCacheSWR<GithubIssueSummary>(
          c.executionCtx,
          c.env,
          `issue-detail:${owner.toLowerCase()}/${repo.toLowerCase()}#${issueNumber}:v1`,
          { softTtlSeconds: ISSUE_CACHE_SOFT_TTL_SECONDS, hardTtlSeconds: ISSUE_CACHE_HARD_TTL_SECONDS },
          // `null` (no such issue / it's a pull request) is never cached — see `withCacheSWR`.
          () => fetchRepositoryIssue(env.GITHUB_DISCOVERY_TOKEN, owner, repo, issueNumber),
        ),
        getTaskRefForIssue(supabase, project.id, issueNumber),
      ]);

      if (!issue) {
        return errorResponse(c, 404, "issue_not_found", "That issue couldn't be found.");
      }

      return c.json(
        {
          ...toIssuePayload(issue),
          source: "devtunnel" as const,
          // Trimmed to the same fields as the frontend's `IssueProjectRef`
          // (`lib/issues/types.ts`) — no project id, nothing a reader of an
          // issue has a use for.
          project: {
            slug: project.slug,
            name: project.name,
            repositoryFullName: project.repositoryFullName,
            repositoryUrl: project.repositoryUrl,
            techStack: project.techStack,
          },
          // A live DevTunnel task created from this issue, or `null`. When it
          // exists, the task page is where claiming and `dev start` happen.
          task,
        },
        200,
      );
    }

    // Not a DevTunnel project. Every issue on the site opens THIS page, so a
    // raw GitHub-catalog repository (`/github-projects`,
    // `/github-open-source-tools`) or a DevTunnel tool is resolved by its
    // `owner--repo` slug instead. There is never a DevTunnel task for these.
    const ref = catalogSlugToOwnerRepo(projectSlug);
    if (!ref) {
      return errorResponse(c, 404, "not_found", "This project isn't on DevTunnel");
    }

    const [meta, issue] = await Promise.all([
      withCacheSWR<GitHubRepoMetadata>(
        c.executionCtx,
        c.env,
        `issue-repo:${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}:v1`,
        { softTtlSeconds: REPO_META_SOFT_TTL_SECONDS, hardTtlSeconds: REPO_META_HARD_TTL_SECONDS },
        () => fetchRepositoryMetadata(env.GITHUB_DISCOVERY_TOKEN, ref.owner, ref.repo),
      ),
      withCacheSWR<GithubIssueSummary>(
        c.executionCtx,
        c.env,
        `issue-detail:${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}#${issueNumber}:v1`,
        { softTtlSeconds: ISSUE_CACHE_SOFT_TTL_SECONDS, hardTtlSeconds: ISSUE_CACHE_HARD_TTL_SECONDS },
        () => fetchRepositoryIssue(env.GITHUB_DISCOVERY_TOKEN, ref.owner, ref.repo, issueNumber),
      ),
    ]);

    // A private repository (or one that vanished) is the same "doesn't exist" as an unknown slug.
    if (!meta || meta.isPrivate) {
      return errorResponse(c, 404, "not_found", "This project isn't on DevTunnel");
    }
    if (!issue) {
      return errorResponse(c, 404, "issue_not_found", "That issue couldn't be found.");
    }

    return c.json(
      {
        ...toIssuePayload(issue),
        source: "github" as const,
        project: {
          slug: projectSlug.toLowerCase(),
          name: meta.name,
          repositoryFullName: meta.fullName,
          repositoryUrl: meta.htmlUrl,
          techStack: meta.primaryLanguage ? [meta.primaryLanguage] : [],
        },
        task: null,
      },
      200,
    );
  } catch (err) {
    if (err instanceof GitHubRepoError) {
      if (err.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", "GitHub is rate limiting requests. Try again shortly.");
      }
      if (err.reason === "not_found") {
        return errorResponse(c, 404, "issue_not_found", "That issue couldn't be found.");
      }
      logger.error("issue_detail_github_error", {
        reason: err.reason,
        projectSlug,
        issueNumber,
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now.");
    }

    logger.error("issue_detail_failed", {
      error: err instanceof Error ? err.message : String(err),
      projectSlug,
      issueNumber,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load this issue right now");
  }
});
