import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables, GithubIssueSummary } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { withCacheSWR } from "../lib/cache";
import {
  getProjectDetailBySlug,
  listAvailableProjects,
  getProjectById,
  startProject,
  submitProject,
  type ContributorMatchProfile,
} from "../db/projects";
import { getProjectTaskProgress, listTasks } from "../db/tasks";
import { isProjectContributor, joinProject } from "../db/catalogMemberships";
import { applyCatalogStar, readCatalogStarStatus } from "../lib/catalogStar";
import {
  fetchRepositoryCatalogSummary,
  fetchRepositoryContributorCount,
  fetchRepositoryIssues,
} from "../lib/githubRepo";
import { getValidGithubAccessToken } from "../db/githubTokens";
import { findExistingFork, forkRepositoryForUser, GitHubForkError } from "../lib/githubFork";
import {
  createPullRequest,
  fetchDefaultBranch,
  findOpenPullRequest,
  GitHubPullRequestError,
} from "../lib/githubPullRequest";
import { handleRepositoryIssuesRequest, type ListedIssue } from "../lib/repoIssuesList";
import { submitBodySchema, buildPullRequestBody } from "./tasks";

/**
 * Contributor — Projects on DevTunnel (`/projects` — "Projects on
 * Devtunnel" in `AppSidebar`/`AppBottomNav`). Mounted on the app root in
 * src/index.ts (`app.route("/", projects)`), same convention as
 * `/tasks`/`/issues`/`/github-projects` — reachable by any signed-in
 * contributor, not just admins.
 *
 * Distinct from `GET /github-projects` (src/routes/githubProjects.ts):
 * this is DevTunnel's own curated catalog — see src/db/projects.ts's doc
 * comment for the full data-source distinction.
 *
 * ROUTE ORDER MATTERS HERE. Hono matches in registration order, so the
 * literal `/projects/available` below must stay declared before the
 * `/projects/:slug` detail route — otherwise "available" would be
 * swallowed as a slug and every catalog request would 404. The same
 * applies to `/opensource-tools/available` in src/routes/openSourceTools.ts.
 *
 * No conflict with `GET /projects/:projectSlug/tasks/:taskId`
 * (src/routes/tasks.ts): that path has two more segments, so Hono never
 * has to choose between them.
 */
export const projects = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * `GET /projects/available` — every active, onboarded DevTunnel project,
 * newest first (devtunnel_workflow.txt Module 3: "Find an Open Source
 * Project" / `GET /projects/available`). This is the one real, spec'd
 * endpoint `devtunnel-frontend/src/lib/home/api.ts`'s `getRecommendedProjects`
 * calls, both for the `/projects` page and the home page's "Recommended
 * for you" section.
 *
 * `requireAuth` only — no admin role required, same reasoning
 * `GET /tasks`/`GET /issues` already document for themselves: browsing
 * DevTunnel's project list to find something to work on is not an admin
 * action.
 *
 * Response body is the raw `ProjectSummary[]` array — NOT wrapped in the
 * `{ data: ... }` envelope (src/lib/response.ts) — matching the
 * already-shipped frontend contract (`fetchFromApi<ProjectSummary[]>` in
 * lib/home/api.ts, which parses the body directly as `T`), the same
 * documented exception every other list route in this backend uses
 * (`GET /tasks`, `GET /admin/tasks`, `GET /admin/projects`, `GET /issues`).
 * Error responses still use the standard
 * `{ error: { code, message, requestId } }` envelope.
 *
 * Unlike `GET /tasks?recommended=true`, a contributor who hasn't finished
 * onboarding is NOT rejected here — `/projects` is a browsable catalog a
 * signed-in contributor can land on before ever completing onboarding
 * (the Contributor Home Module's "Find an Open Source Project" button),
 * so every active project is still returned; it's only the per-project
 * `matchPercent`/`matchRole` fields that are quietly omitted when there's
 * no onboarding profile to score against (see `computeMatch` in
 * src/db/projects.ts).
 */
projects.get("/projects/available", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    // requireAuth already guarantees this — kept for type safety, same
    // pattern used throughout this backend's protected routes.
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  // Cheap indexed-table read, same generous per-minute budget
  // `GET /tasks` (src/routes/tasks.ts) applies to its own list read.
  const withinLimit = await checkRateLimit(c, {
    bucket: "projects-available-list",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);

    // Only score matches against a profile that actually has onboarding
    // answers recorded — an account that never finished onboarding has
    // empty arrays for all three fields, which `computeMatch` already
    // treats as "no signal" on its own, but skipping the object entirely
    // here keeps that behavior explicit at the call site too.
    const profile: ContributorMatchProfile | null = user.onboardingCompleted
      ? {
          developerRoles: user.developerRoles,
          skills: user.skills,
          technologies: user.technologies,
        }
      : null;

    const list = await listAvailableProjects(supabase, profile);
    return c.json(list, 200);
  } catch (err) {
    logger.error("projects_available_list_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load projects right now");
  }
});

/* ---------------------------------------------------------------------------
 * View Project — `/projects/:projectSlug` (devtunnel-frontend's
 * `lib/projects/{types,api,client-api}.ts`).
 * ------------------------------------------------------------------------ */

/**
 * The live GitHub half of a project's detail payload, cached per
 * repository. Separate from the stored Supabase row for one reason:
 * `devtunnel.projects` snapshots stars/forks/open-issues at onboarding
 * time (sql/006) and never records `license` or `pushedAt` at all, so
 * "last updated" and the license would otherwise either be missing or
 * be a months-old number presented as current.
 *
 * Cached rather than fetched per request because it's identical for
 * every viewer — the per-viewer fields (star status, membership) are
 * layered on afterwards and never enter this cache slot, the same split
 * `GET /github-projects/:slug` documents for its own payload.
 */
interface ProjectGithubSnapshot {
  license: string | null;
  pushedAt: string;
  stars: number;
  forks: number;
  openIssuesCount: number;
  contributorCount: number;
  issues: GithubIssueSummary[];
}

/**
 * Same 10-minute soft TTL `GET /github-projects/:slug` uses, for the same
 * reason: a handful of GitHub calls for one repository is cheap enough to
 * refresh often, and a contributor reading the All Issues tab shouldn't
 * be looking at an hour-old list.
 */
const DETAIL_CACHE_SOFT_TTL_SECONDS = 10 * 60;
const DETAIL_CACHE_HARD_TTL_SECONDS = DETAIL_CACHE_SOFT_TTL_SECONDS * 3;

/**
 * How many of the repository's open issues the All Issues tab shows —
 * the same first-page-only posture `GET /github-projects/:slug` takes,
 * not the full-backlog walk `fetchAllRepositoryIssues` does for New Issue
 * Detection. This is a browsable preview with a link out to GitHub on
 * every row, not a scan that has to be exhaustive to be correct.
 */
const DETAIL_ISSUES_LIMIT = 50;

/**
 * Upper bound on tasks returned with a project. Well above any onboarded
 * project's real task count, and the frontend's Tasks tab filters this
 * list in the browser rather than paging it, so a single bounded read is
 * the right shape here (same reasoning `AVAILABLE_PROJECTS_LIMIT`
 * documents in src/db/projects.ts).
 */
const DETAIL_TASKS_LIMIT = 200;

/**
 * `GET /projects/:slug` — backs the View Project page, the destination
 * `DevtunnelProjectCard` and `ProjectCard` already link to.
 *
 * Assembles three sources and keeps them honestly separate:
 *  1. **Supabase** (`getProjectDetailBySlug`) — the onboarded project
 *     itself: description, README, curated tech stack, author, and the
 *     task/contributor counts. DevTunnel contributors and GitHub
 *     contributors stay two distinct numbers throughout
 *     (admin_workflow.txt section 5: "do not mix the two datasets").
 *  2. **GitHub, cached** (`ProjectGithubSnapshot`) — license, last push,
 *     current stars/forks/open-issue count, true contributor count, and
 *     the open-issue list.
 *  3. **Per viewer, uncached** — star status and whether this contributor
 *     has joined the project.
 *
 * When GitHub is unreachable the page still renders: the stored
 * onboarding snapshot supplies stars/forks/open-issues, `license` and
 * `pushedAt` come back `null`, and `issues` is empty. Nothing is
 * invented to fill those gaps (rule 21), which is why `pushedAt` is
 * nullable on the wire — the frontend's `DevtunnelProjectDetail.pushedAt`
 * needs to be `string | null` to match, and its header should render
 * "Updated —" rather than a fabricated timestamp.
 *
 * A slug that matches nothing, a soft-deleted project, and an archived
 * one all respond 404 — all three are "this page doesn't exist" from a
 * contributor's side, and distinguishing them on the wire would leak
 * which it was for no benefit.
 *
 * Response body is the raw detail object, matching the already-shipped
 * frontend contract (`getDevtunnelProjectBySlug` parses the body directly
 * as `DevtunnelProjectDetail`) — the same envelope exception every other
 * contributor route here documents.
 */
projects.get("/projects/:slug", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "projects-detail",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);

    const profile: ContributorMatchProfile | null = user.onboardingCompleted
      ? {
          developerRoles: user.developerRoles,
          skills: user.skills,
          technologies: user.technologies,
        }
      : null;

    const project = await getProjectDetailBySlug(supabase, slug, profile);
    if (!project) {
      return errorResponse(c, 404, "not_found", "This project isn't on DevTunnel");
    }

    // The GitHub snapshot, this project's tasks, and the two per-viewer
    // reads are independent of one another — run them together rather
    // than serially, so the slowest one sets the response time instead of
    // their sum.
    const [snapshot, tasksPage, taskProgress, starStatus, viewerIsContributing] = await Promise.all([
      project.repo
        ? withCacheSWR<ProjectGithubSnapshot>(
            c.executionCtx,
            c.env,
            `project-detail-github:${project.repositoryFullName.toLowerCase()}:v1`,
            {
              softTtlSeconds: DETAIL_CACHE_SOFT_TTL_SECONDS,
              hardTtlSeconds: DETAIL_CACHE_HARD_TTL_SECONDS,
            },
            async () => {
              const { owner, repo } = project.repo!;
              // `GITHUB_DISCOVERY_TOKEN`, not the viewer's own token —
              // this data is the same for every viewer and fills a
              // shared cache slot, and reading a public repository's
              // metadata must not require the contributor to have
              // connected GitHub at all (same choice
              // `GET /github-projects/:slug` documents).
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
                license: summary.license,
                pushedAt: summary.pushedAt,
                stars: summary.stars,
                forks: summary.forks,
                openIssuesCount: summary.openIssues,
                contributorCount,
                issues,
              };
            },
          ).catch((err) => {
            // GitHub being down degrades this page; it never fails it.
            // The stored onboarding snapshot below covers the counts, and
            // the tabs that depend on live data say so themselves.
            logger.error("project_detail_github_snapshot_failed", {
              error: err instanceof Error ? err.message : String(err),
              slug,
              requestId: c.get("requestId"),
            });
            return null;
          })
        : Promise.resolve(null),
      listTasks(supabase, { limit: DETAIL_TASKS_LIMIT, before: null, projectSlug: slug }),
      // Per-stage counts for the project progress bar. Supplementary, like
      // the GitHub snapshot: if the count query fails the page still
      // loads, just without the bar (`taskProgress: null`) — a progress
      // figure nobody can verify is worse than none (rule 38).
      getProjectTaskProgress(supabase, slug).catch((err) => {
        logger.error("project_detail_task_progress_failed", {
          error: err instanceof Error ? err.message : String(err),
          slug,
          requestId: c.get("requestId"),
        });
        return null;
      }),
      project.repositoryFullName
        ? readCatalogStarStatus(env, project.repositoryFullName, user.id)
        : Promise.resolve({ starredByViewer: false, localStarCount: 0 }),
      isProjectContributor(supabase, project.id, user.id),
    ]);

    const response = {
      id: project.id,
      slug: project.slug,
      name: project.name,
      description: project.description,
      repositoryUrl: project.repositoryUrl,
      repositoryFullName: project.repositoryFullName,
      // Defensive fallback to the repository owner when no `github_author`
      // snapshot was captured at onboarding time — every project created
      // through `complete_project_onboarding` has one, so this only avoids
      // a null reaching the page rather than trusting the row blindly
      // (rule 73). Same fallback `toAdminProjectSummary` already applies
      // in src/db/adminProjects.ts. `name`/`avatarUrl` stay null rather
      // than being guessed at.
      author:
        project.author ??
        (project.repo
          ? {
              username: project.repo.owner,
              name: null,
              avatarUrl: null,
              profileUrl: `https://github.com/${project.repo.owner}`,
            }
          : null),
      primaryTech: project.primaryTech,
      techStack: project.techStack,
      license: snapshot?.license ?? null,
      readme: project.readme,
      status: project.status,

      // Live where GitHub answered, the onboarding snapshot where it
      // didn't — never a mix of the two within one field.
      stars: snapshot?.stars ?? project.storedStars,
      forks: snapshot?.forks ?? project.storedForks,
      openIssuesCount: snapshot?.openIssuesCount ?? project.storedOpenIssues,
      githubContributorCount: snapshot?.contributorCount ?? project.githubContributorCount,

      devTunnelContributorCount: project.devTunnelContributorCount,
      taskCount: project.taskCount,
      /** Tasks per stage (open / in progress / in review / done) — `null` when the count query failed. */
      taskProgress,

      createdAt: project.createdAt,
      pushedAt: snapshot?.pushedAt ?? null,

      isStarredByViewer: starStatus.starredByViewer,
      localStarCount: starStatus.localStarCount,
      viewerIsContributing,

      ...(project.matchPercent !== undefined ? { matchPercent: project.matchPercent } : {}),
      ...(project.matchRole !== undefined ? { matchRole: project.matchRole } : {}),

      tasks: tasksPage.tasks,

      // Mapped to the same `Issue` shape `GET /issues` returns, so the
      // All Issues tab renders identical rows whether it's showing one
      // project's issues or every project's. `fetchRepositoryIssues`
      // requests open issues only, so `state` is always "OPEN" here —
      // the frontend's Open/Closed filter is still correct, its Closed
      // bucket is simply always empty on this page. This is only the
      // first `DETAIL_ISSUES_LIMIT` of them; `GET /projects/:slug/issues`
      // below returns the rest, in this same row shape.
      issues: (snapshot?.issues ?? []).map((issue) => toProjectIssueRow(issue, project)),
    };

    return c.json(response, 200);
  } catch (err) {
    logger.error("project_detail_failed", {
      error: err instanceof Error ? err.message : String(err),
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load this project right now");
  }
});

/**
 * The parts of an onboarded project an issue row needs to name it —
 * the `project` block on the frontend's `Issue` shape
 * (`lib/issues/types.ts`).
 */
interface IssueRowProject {
  slug: string;
  name: string;
  repositoryFullName: string;
  repositoryUrl: string;
  techStack: string[];
}

/**
 * One GitHub issue as the frontend's `Issue` row. Shared by the detail
 * route's first-page preview and the "Load all issues" route below, so
 * the two can never drift into different row shapes — the All Issues tab
 * swaps one list for the other in place.
 */
function toProjectIssueRow(issue: ListedIssue, project: IssueRowProject) {
  return {
    number: issue.number,
    title: issue.title,
    url: issue.url,
    state: issue.state,
    project: {
      slug: project.slug,
      name: project.name,
      repositoryFullName: project.repositoryFullName,
      repositoryUrl: project.repositoryUrl,
      techStack: project.techStack,
    },
    author: issue.author,
    labels: issue.labels,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
  };
}

/**
 * `GET /projects/:slug/issues` — the All Issues tab's "Load all issues"
 * action: this project's repository's complete open-issue list (up to the
 * shared cap) rather than the first `DETAIL_ISSUES_LIMIT` the detail
 * route ships. Same 404 posture as the detail route — an unknown,
 * soft-deleted, or archived project is one indistinguishable "not found".
 * Shared fetch/cache/error-mapping flow: `lib/repoIssuesList.ts`.
 */
projects.get("/projects/:slug/issues", requireAuth, (c) =>
  handleRepositoryIssuesRequest(c, c.req.param("slug"), {
    name: "projects",
    notFoundMessage: "This project isn't on DevTunnel",
    resolve: async (slug, env) => {
      const project = await getProjectDetailBySlug(getSupabase(env), slug, null);
      if (!project) return "not_found";
      if (!project.repo) return "no_repository";
      return { ...project.repo, context: project };
    },
    mapIssue: (issue, project) => toProjectIssueRow(issue, project),
  }),
);

/**
 * Resolves the project's GitHub repository for the two star routes, or
 * responds `null` for anything the caller should 404 on: an unknown slug,
 * an archived/deleted project, or an onboarded project with no repository
 * recorded (defensive — `complete_project_onboarding` always records one).
 */
async function resolveStarTarget(
  env: ReturnType<typeof getEnv>,
  slug: string,
): Promise<{ owner: string; repo: string; repositoryFullName: string } | null> {
  const supabase = getSupabase(env);
  const project = await getProjectDetailBySlug(supabase, slug, null);
  if (!project?.repo) return null;
  return { ...project.repo, repositoryFullName: project.repositoryFullName };
}

/**
 * `PUT /projects/:slug/star` — the View Project page's Star button.
 *
 * Identical semantics to `PUT /github-projects/:slug/star`: stars the
 * repository on the contributor's own real GitHub account first, then
 * records DevTunnel's local `github_stars` row. Both routes write the
 * same table keyed by `repository_full_name`, which is deliberate — a
 * repository starred from DevTunnel's curated Project page and the same
 * repository starred from the GitHub catalog page are the same star, and
 * a contributor shouldn't see it on one page and not the other.
 *
 * The shared sequence lives in `lib/catalogStar.ts`; this handler only
 * resolves the slug and maps outcomes to this route's own error
 * vocabulary.
 */
projects.put("/projects/:slug/star", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "projects-star",
    limit: 30,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const target = await resolveStarTarget(env, slug);
    if (!target) {
      return errorResponse(c, 404, "not_found", "This project isn't on DevTunnel");
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
        "Reconnect your GitHub account to star this project",
      );
    }

    if (result.status === "github_error") {
      const { error } = result;
      if (error.reason === "not_found") {
        return errorResponse(c, 404, "not_found", "This project's repository is no longer on GitHub");
      }
      if (error.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", error.message);
      }
      logger.error("project_star_github_error", {
        reason: error.reason,
        slug,
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now");
    }

    return c.json(result.star, 200);
  } catch (err) {
    logger.error("project_star_failed", {
      error: err instanceof Error ? err.message : String(err),
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't star this project right now");
  }
});

/** `DELETE /projects/:slug/star` — the reverse of the `PUT` above, same error handling. */
projects.delete("/projects/:slug/star", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "projects-star",
    limit: 30,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const target = await resolveStarTarget(env, slug);
    if (!target) {
      return errorResponse(c, 404, "not_found", "This project isn't on DevTunnel");
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
        "Reconnect your GitHub account to unstar this project",
      );
    }

    if (result.status === "github_error") {
      const { error } = result;
      if (error.reason === "not_found") {
        return errorResponse(c, 404, "not_found", "This project's repository is no longer on GitHub");
      }
      if (error.reason === "rate_limited") {
        return errorResponse(c, 429, "rate_limited", error.message);
      }
      logger.error("project_unstar_github_error", {
        reason: error.reason,
        slug,
        requestId: c.get("requestId"),
      });
      return errorResponse(c, 502, "github_unavailable", "Couldn't reach GitHub right now");
    }

    return c.json(result.star, 200);
  } catch (err) {
    logger.error("project_unstar_failed", {
      error: err instanceof Error ? err.message : String(err),
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't unstar this project right now");
  }
});

/**
 * `POST /projects/:slug/contribute` — the View Project page's primary
 * action ("Contribute to this project").
 *
 * Records the contributor as having joined this project
 * (`devtunnel.project_contributors`, sql/026) and nothing else. It does
 * not fork the repository, assign a task, or touch anything upstream —
 * picking a specific task is a separate decision the contributor makes
 * from the Tasks tab, and nothing here should act on their GitHub
 * account without them asking for it.
 *
 * Idempotent (`joinProject` upserts on the composite key), so a
 * double-click or a retry returns the same 200 as the first call rather
 * than a conflict the frontend would have to interpret.
 *
 * Requires completed onboarding: joining a project without the roles,
 * experience level, and technologies onboarding collects would leave the
 * contributor with no task matching to work from. Rejected with a
 * specific `onboarding_required` code the frontend already turns into
 * "finish setting up your profile first", rather than a generic error.
 *
 * `devTunnelContributorCount` is returned so the sidebar can stay
 * accurate without a reload — note it deliberately does NOT increment on
 * join. That count means "people who completed a task or landed a merged
 * PR here" (sql/015); joining is intent, not delivered work, and
 * conflating them would inflate every project's number with people who
 * clicked a button once (rule 38). See sql/026's header for the full
 * reasoning.
 */
projects.post("/projects/:slug/contribute", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "projects-contribute",
    limit: 20,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  if (!user.onboardingCompleted) {
    return errorResponse(
      c,
      422,
      "onboarding_required",
      "Finish onboarding before joining a project",
    );
  }

  try {
    const supabase = getSupabase(env);
    const project = await getProjectDetailBySlug(supabase, slug, null);
    if (!project) {
      return errorResponse(c, 404, "not_found", "This project isn't on DevTunnel");
    }

    await joinProject(supabase, project.id, user.id);

    return c.json(
      {
        contributing: true,
        devTunnelContributorCount: project.devTunnelContributorCount,
      },
      200,
    );
  } catch (err) {
    logger.error("project_contribute_failed", {
      error: err instanceof Error ? err.message : String(err),
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't join this project right now");
  }
});

/* ---------------------------------------------------------------------------
 * `dev start --project` / `dev submit --project` (devtunnel-cli) — a
 * whole-project claim, mirroring `POST /tasks/:id/start` and
 * `POST /tasks/:id/submit` (src/routes/tasks.ts) column-for-column. See
 * sql/032, sql/033, and src/db/projects.ts's own doc comments for the
 * `claim_status` vs. `status` naming rationale.
 * ------------------------------------------------------------------------ */

const projectIdSchema = z.string().uuid("Invalid project id");

/**
 * Turns a project's name into the slug half of a branch name. Identical
 * in spirit to `slugifyForBranch` in src/routes/tasks.ts, duplicated here
 * (rather than imported) only because it's a trivial pure string
 * transform with no project/task-specific logic worth coupling the two
 * route files over.
 */
function slugifyForBranch(input: string, fallback: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return slug || fallback.slice(0, 8);
}

/**
 * `POST /projects/:id/start` — the backend half of `dev start <project-id>
 * --project` (devtunnel-cli's `src/commands/start.ts`). Full parallel of
 * `POST /tasks/:id/start` (src/routes/tasks.ts) — same fork-or-reuse
 * logic against the contributor's own stored GitHub token, same
 * idempotent-resume behavior for a re-run, same response shape
 * (`fork`/`upstream`/`branch`/`startedAt`) so the CLI's `startCommand`
 * needs no branching on which endpoint it called.
 *
 * Unlike a task, a project has no title/roles to derive a branch prefix
 * from, so every project-level claim gets a plain `feature/<project-name>`
 * branch — a contributor can always rename it locally before `dev submit`.
 */
projects.post("/projects/:id/start", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  const projectIdResult = projectIdSchema.safeParse(c.req.param("id"));
  if (!projectIdResult.success) {
    return errorResponse(c, 400, "invalid_request", projectIdResult.error.issues[0]!.message);
  }
  const projectId = projectIdResult.data;

  const withinLimit = await checkRateLimit(c, {
    bucket: "projects-start",
    limit: 10,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);

    const project = await getProjectById(supabase, projectId);
    if (!project) {
      return errorResponse(c, 404, "project_not_found", "Project not found");
    }
    if (!project.github_owner || !project.github_full_name) {
      return errorResponse(
        c,
        422,
        "project_not_github_backed",
        "This project has no linked GitHub repository",
      );
    }

    const alreadyMine =
      project.assignee_id === user.id && project.assignee_fork_full_name && project.assignee_branch;

    const accessToken = await getValidGithubAccessToken(supabase, env, user.id);
    if (!accessToken) {
      return errorResponse(
        c,
        403,
        "github_reauth_required",
        "Reconnect your GitHub account to start a project",
      );
    }

    const [owner, repo] = project.github_full_name.split("/");
    if (!owner || !repo) {
      return errorResponse(c, 422, "project_not_github_backed", "Malformed repository reference");
    }

    let fork = alreadyMine ? null : await findExistingFork(accessToken, owner, repo);
    if (!fork && !alreadyMine) {
      fork = await forkRepositoryForUser(accessToken, owner, repo);
    }

    const forkFullName = alreadyMine ? project.assignee_fork_full_name! : fork!.fullName;
    const branch = alreadyMine
      ? project.assignee_branch!
      : `feature/${slugifyForBranch(project.name, projectId)}`;

    const outcome = await startProject(supabase, projectId, user.id, forkFullName, branch);

    if (outcome.status === "not_found") {
      return errorResponse(c, 404, "project_not_found", "Project not found");
    }
    if (outcome.status === "already_claimed") {
      return errorResponse(
        c,
        409,
        "project_already_claimed",
        "Someone else already started this project",
      );
    }
    if (outcome.status === "already_done") {
      return errorResponse(c, 409, "project_already_done", "This project is already done");
    }

    return c.json(
      {
        data: {
          taskId: outcome.project.id,
          status: outcome.project.claimStatus,
          fork: {
            fullName: outcome.project.assigneeForkFullName,
            cloneUrl: `https://github.com/${outcome.project.assigneeForkFullName}.git`,
            htmlUrl: `https://github.com/${outcome.project.assigneeForkFullName}`,
          },
          upstream: {
            fullName: project.github_full_name,
            cloneUrl: `https://github.com/${project.github_full_name}.git`,
          },
          branch: outcome.project.assigneeBranch,
          startedAt: outcome.project.assigneeStartedAt,
        },
      },
      200,
    );
  } catch (err) {
    if (err instanceof GitHubForkError) {
      const status = err.reason === "rate_limited" ? 429 : err.reason === "unauthorized" ? 403 : 502;
      return errorResponse(c, status, `github_${err.reason}`, err.message);
    }
    logger.error("project_start_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't start this project right now");
  }
});

/**
 * `POST /projects/:id/submit` — the backend half of `dev submit
 * <project-id> --project`. Full parallel of `POST /tasks/:id/submit`,
 * reusing that route's own `submitBodySchema` and `buildPullRequestBody`
 * (exported from src/routes/tasks.ts) rather than a second copy of
 * either. Only real difference: a project-level submission has no GitHub
 * issue to link, so the PR body's "Related Issue" section always reads
 * "_No linked issue._".
 */
projects.post("/projects/:id/submit", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  const projectIdResult = projectIdSchema.safeParse(c.req.param("id"));
  if (!projectIdResult.success) {
    return errorResponse(c, 400, "invalid_request", projectIdResult.error.issues[0]!.message);
  }
  const projectId = projectIdResult.data;

  const bodyResult = submitBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!bodyResult.success) {
    return errorResponse(
      c,
      400,
      "invalid_body",
      bodyResult.error.issues[0]?.message ?? "Invalid submit request",
    );
  }
  const { branch, title, type, commits, testedNote } = bodyResult.data;

  const withinLimit = await checkRateLimit(c, {
    bucket: "projects-submit",
    limit: 10,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);

    const project = await getProjectById(supabase, projectId);
    if (!project) {
      return errorResponse(c, 404, "project_not_found", "Project not found");
    }
    if (!project.github_owner || !project.github_full_name) {
      return errorResponse(
        c,
        422,
        "project_not_github_backed",
        "This project has no linked GitHub repository",
      );
    }
    if (!project.assignee_id || !project.assignee_fork_full_name || !project.assignee_branch) {
      return errorResponse(
        c,
        409,
        "project_not_started",
        "Run `dev start --project` on this project before submitting",
      );
    }
    if (project.assignee_id !== user.id) {
      return errorResponse(c, 403, "project_not_yours", "This project was started by someone else");
    }
    if (project.claim_status === "DONE") {
      return errorResponse(c, 409, "project_already_done", "This project is already done");
    }
    if (project.assignee_branch !== branch) {
      return errorResponse(
        c,
        409,
        "branch_mismatch",
        `Expected branch "${project.assignee_branch}" for this project, but "${branch}" is checked out`,
      );
    }

    const accessToken = await getValidGithubAccessToken(supabase, env, user.id);
    if (!accessToken) {
      return errorResponse(
        c,
        403,
        "github_reauth_required",
        "Reconnect your GitHub account to submit this project",
      );
    }

    const [upstreamOwner, upstreamRepo] = project.github_full_name.split("/");
    const [forkOwner] = project.assignee_fork_full_name.split("/");
    if (!upstreamOwner || !upstreamRepo || !forkOwner) {
      return errorResponse(c, 422, "project_not_github_backed", "Malformed repository reference");
    }

    const baseBranch = await fetchDefaultBranch(accessToken, upstreamOwner, upstreamRepo);

    const existingPr = await findOpenPullRequest(
      accessToken,
      upstreamOwner,
      upstreamRepo,
      forkOwner,
      branch,
    );
    const isNew = !existingPr;

    const pr =
      existingPr ??
      (
        await createPullRequest(accessToken, {
          baseOwner: upstreamOwner,
          baseRepo: upstreamRepo,
          baseBranch,
          headOwner: forkOwner,
          headBranch: branch,
          title,
          body: buildPullRequestBody({
            type,
            commits,
            testedNote: testedNote ?? null,
            githubIssueNumber: null, // no single issue behind a whole-project submission
          }),
        })
      ).pr;

    const outcome = await submitProject(supabase, projectId, user.id, {
      prUrl: pr.htmlUrl,
      prNumber: pr.number,
      branch,
      title,
    });

    if (outcome.status === "not_found") {
      return errorResponse(c, 404, "project_not_found", "Project not found");
    }
    if (outcome.status === "not_yours") {
      return errorResponse(c, 403, "project_not_yours", "This project was started by someone else");
    }
    if (outcome.status === "already_done") {
      return errorResponse(c, 409, "project_already_done", "This project is already done");
    }

    return c.json(
      {
        data: {
          taskId: outcome.project.id,
          status: outcome.project.claimStatus,
          pullRequest: {
            id: outcome.pullRequest.id,
            number: outcome.pullRequest.number,
            url: outcome.pullRequest.url,
            isNew,
          },
        },
      },
      200,
    );
  } catch (err) {
    if (err instanceof GitHubPullRequestError) {
      const status =
        err.reason === "rate_limited"
          ? 429
          : err.reason === "unauthorized"
            ? 403
            : err.reason === "validation"
              ? 422
              : err.reason === "not_found"
                ? 404
                : 502;
      return errorResponse(c, status, `github_${err.reason}`, err.message);
    }
    logger.error("project_submit_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't submit this project right now");
  }
});