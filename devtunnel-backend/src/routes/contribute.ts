import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { withCacheSWR } from "../lib/cache";
import { getProjectDetailBySlug } from "../db/projects";
import { getOpenSourceToolDetailBySlug } from "../db/openSourceTools";
import { listTasks } from "../db/tasks";
import { isOpenSourceToolContributor, isProjectContributor } from "../db/catalogMemberships";
import {
  readProjectProgress,
  readToolProgress,
  saveProjectProgress,
  saveToolProgress,
} from "../db/contributionProgress";
import {
  fetchContributionGuideSnapshot,
  type ContributionGuideSnapshot,
} from "../lib/contributionGuide";

/**
 * Contributor — the **Contribute** page
 * (`/projects/:projectSlug/contribute` and
 * `/opensource-tools/:toolSlug/contribute` in devtunnel-frontend), the
 * destination the "Contribute to this project" / "Contribute to this
 * tool" button lands on after joining.
 *
 * Mounted on the app root in src/index.ts (`app.route("/", contribute)`),
 * same convention as `/projects`, `/tasks` and `/issues`.
 *
 * ROUTE ORDER: these paths have more segments than the `/projects/:slug`
 * and `/opensource-tools/:slug` detail routes, so Hono never has to
 * choose between them and this file can be mounted either side of
 * src/routes/projects.ts. That's the same reason
 * `GET /projects/:projectSlug/tasks/:taskId` already coexists with the
 * detail route without ordering rules.
 *
 * ---------------------------------------------------------------------
 * WHY THIS ISN'T FOLDED INTO `GET /projects/:slug`
 *
 * The detail route already returns the project, its tasks and its issues,
 * so at first glance the Contribute page needs no endpoint at all — and
 * indeed the page shipped against that payload alone.
 *
 * What it couldn't answer from there is the two questions that decide
 * whether a first contribution actually happens: *does this project have
 * a contributing guide*, and *is there anything labelled for a newcomer
 * right now*. Both are live GitHub reads (src/lib/contributionGuide.ts)
 * that cost extra requests and a separate cache slot, and neither belongs
 * on the detail page, which every contributor loads while browsing. So
 * they're paid for on the one page that needs them, by the smaller set of
 * people who got that far — rather than made a tax on the page before it.
 *
 * The rest of the payload is deliberately the *same* data the detail
 * route returns, read through the same db modules, so the two can't drift
 * into disagreeing about a project (rule 51).
 * ---------------------------------------------------------------------
 */
export const contribute = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * Community files and starter-issue labels change on the order of weeks,
 * not minutes, so this cache is much longer-lived than the detail page's
 * 10-minute repository snapshot. Half an hour soft, an hour and a half
 * hard: a maintainer who adds CONTRIBUTING.md sees it reflected the same
 * afternoon, and no contributor ever waits on five GitHub requests.
 */
const GUIDE_CACHE_SOFT_TTL_SECONDS = 30 * 60;
const GUIDE_CACHE_HARD_TTL_SECONDS = GUIDE_CACHE_SOFT_TTL_SECONDS * 3;

/**
 * Upper bound on tasks returned with the Contribute page, matching
 * `DETAIL_TASKS_LIMIT` in src/routes/projects.ts. The frontend filters
 * this list in the browser (status, role, difficulty, title) rather than
 * paging it, so one bounded read is the right shape (rule 67).
 */
const CONTRIBUTE_TASKS_LIMIT = 200;

/**
 * Bounds on what a client may save as checklist progress.
 *
 * The step ids are opaque to this backend by design (sql/027) — they're
 * frontend copy that will be reworded — so there's no enum to validate
 * against. What can be validated is size: eight steps exist today, 32
 * leaves room for the checklist to grow, and 64 characters is far more
 * than a slug needs. Anything beyond that is a client bug or an abuse
 * attempt, and is rejected rather than stored (rule 67).
 *
 * Duplicates are collapsed rather than rejected: a client sending the
 * same id twice means the same thing as sending it once, and failing the
 * whole save over it would lose the contributor's other ticks.
 */
const progressSchema = z.object({
  completedSteps: z
    .array(z.string().trim().min(1).max(64))
    .max(32)
    .transform((steps) => Array.from(new Set(steps))),
});

/** Shared snapshot read, cached per repository — identical for every viewer (see the module header). */
function loadGuideSnapshot(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  env: ReturnType<typeof getEnv>,
  owner: string,
  repo: string,
): Promise<ContributionGuideSnapshot | null> {
  return withCacheSWR<ContributionGuideSnapshot>(
    c.executionCtx,
    c.env,
    `contribute-guide:${owner.toLowerCase()}/${repo.toLowerCase()}:v1`,
    {
      softTtlSeconds: GUIDE_CACHE_SOFT_TTL_SECONDS,
      hardTtlSeconds: GUIDE_CACHE_HARD_TTL_SECONDS,
    },
    // `GITHUB_DISCOVERY_TOKEN`, not the viewer's own: this fills a shared
    // cache slot and is the same for everyone, and reading a public
    // repository's community files must not require the contributor to
    // have connected GitHub (same choice `GET /projects/:slug` documents).
    () => fetchContributionGuideSnapshot(env.GITHUB_DISCOVERY_TOKEN, owner, repo),
  ).catch((err) => {
    // GitHub being unreachable degrades this page; it never fails it.
    logger.error("contribute_guide_snapshot_failed", {
      error: err instanceof Error ? err.message : String(err),
      owner,
      repo,
      requestId: c.get("requestId"),
    });
    return null;
  });
}

/**
 * `GET /projects/:slug/contribute` — everything the Contribute page shows
 * for one DevTunnel project.
 *
 * Three sources, kept honestly separate, same split `GET /projects/:slug`
 * documents for itself:
 *  1. **Supabase** — the project row and its DevTunnel tasks.
 *  2. **GitHub, cached** — the contributing guide, code of conduct, and
 *     current starter-issue counts.
 *  3. **Per viewer, uncached** — membership and checklist progress.
 *
 * When GitHub is unreachable the page still renders: `guide` comes back
 * with nulls and zeros, which the frontend states plainly ("no
 * contributing guide found") rather than filling in (rule 21). Nothing is
 * invented to cover the gap.
 *
 * Unknown slug, soft-deleted and archived projects all respond 404 —
 * all three are "this page doesn't exist" from a contributor's side, and
 * distinguishing them on the wire would leak which it was for no benefit.
 *
 * Not gated on `viewerIsContributing`: someone who hasn't joined can
 * still read how to contribute. Gating it would hide the information most
 * likely to make them join.
 *
 * Response body is the raw payload object, not the `{ data }` envelope —
 * the same documented exception every other contributor route here uses.
 */
contribute.get("/projects/:slug/contribute", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "contribute-guide",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);

    const project = await getProjectDetailBySlug(supabase, slug, null);
    if (!project) {
      return errorResponse(c, 404, "not_found", "This project isn't on DevTunnel");
    }

    const [guide, tasksPage, viewerIsContributing, progress] = await Promise.all([
      project.repo
        ? loadGuideSnapshot(c, env, project.repo.owner, project.repo.repo)
        : Promise.resolve(null),
      listTasks(supabase, { limit: CONTRIBUTE_TASKS_LIMIT, before: null, projectSlug: slug }),
      isProjectContributor(supabase, project.id, user.id),
      readProjectProgress(supabase, project.id, user.id),
    ]);

    return c.json(
      {
        kind: "project" as const,
        id: project.id,
        slug: project.slug,
        name: project.name,
        description: project.description,
        repositoryUrl: project.repositoryUrl,
        repositoryFullName: project.repositoryFullName,
        // Derived, not stored: `${repositoryUrl}.git` is what a
        // contributor pastes after `git clone`, and deriving it here
        // keeps the frontend from string-building a URL of its own.
        cloneUrl: project.repositoryUrl ? `${project.repositoryUrl}.git` : null,
        techStack: project.techStack,
        primaryTech: project.primaryTech,
        openIssuesCount: project.storedOpenIssues,

        viewerIsContributing,

        // Null throughout when GitHub couldn't be reached, or when the
        // project has no repository recorded. Never a guessed URL.
        guide: guide ?? {
          contributingUrl: null,
          codeOfConductUrl: null,
          goodFirstIssueCount: 0,
          helpWantedCount: 0,
          starterIssues: [],
        },

        tasks: tasksPage.tasks,

        completedSteps: progress.completedSteps,
        progressUpdatedAt: progress.updatedAt,
      },
      200,
    );
  } catch (err) {
    logger.error("project_contribute_guide_failed", {
      error: err instanceof Error ? err.message : String(err),
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load this project right now");
  }
});

/**
 * `GET /opensource-tools/:slug/contribute` — the same page for a curated
 * tool.
 *
 * Two deliberate differences from the project route above, both of which
 * the frontend already renders as facts rather than gaps:
 *
 *  - `tasks` is always `[]`. `devtunnel.tasks` hangs off a project, never
 *    a tool (sql/017), so there is no task list to return and none is
 *    invented. The page says so and points at the tool's own issues.
 *  - Everything repository-shaped is `null` for a tool whose `source_url`
 *    isn't a GitHub repository (`getOpenSourceToolDetailBySlug` resolves
 *    `repo` to `null` in that case). No fork, no clone URL, no guide
 *    probe — and no git commands rendered that couldn't apply.
 */
contribute.get("/opensource-tools/:slug/contribute", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "contribute-guide",
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

    const repositoryUrl = tool.repo
      ? `https://github.com/${tool.repo.owner}/${tool.repo.repo}`
      : null;

    const [guide, viewerIsContributing, progress] = await Promise.all([
      tool.repo ? loadGuideSnapshot(c, env, tool.repo.owner, tool.repo.repo) : Promise.resolve(null),
      isOpenSourceToolContributor(supabase, tool.id, user.id),
      readToolProgress(supabase, tool.id, user.id),
    ]);

    return c.json(
      {
        kind: "tool" as const,
        id: tool.id,
        slug: tool.slug,
        name: tool.name,
        description: tool.description,
        // The tool's own site, which for a non-GitHub tool is the only
        // place its contribution rules exist.
        sourceUrl: tool.sourceUrl,
        repositoryUrl,
        repositoryFullName: tool.repo ? `${tool.repo.owner}/${tool.repo.repo}` : null,
        cloneUrl: repositoryUrl ? `${repositoryUrl}.git` : null,
        techStack: tool.labels,
        primaryTech: tool.primaryLanguage,
        openIssuesCount: null,

        viewerIsContributing,

        guide: guide ?? {
          contributingUrl: null,
          codeOfConductUrl: null,
          goodFirstIssueCount: 0,
          helpWantedCount: 0,
          starterIssues: [],
        },

        tasks: [],

        completedSteps: progress.completedSteps,
        progressUpdatedAt: progress.updatedAt,
      },
      200,
    );
  } catch (err) {
    logger.error("tool_contribute_guide_failed", {
      error: err instanceof Error ? err.message : String(err),
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load this tool right now");
  }
});

/**
 * `PUT /projects/:slug/contribute/progress` — saves which submission
 * steps this contributor has ticked.
 *
 * `PUT` with the full set, not `POST` per step: the checklist is small
 * and entirely on screen, so the client always knows the complete state,
 * and replacing it makes the write idempotent under a double-click, a
 * retry, or two tabs open at once (rule 55).
 *
 * Private by construction — the row is keyed to the authenticated user,
 * and there is no route anywhere that reads another contributor's
 * progress.
 *
 * Unlike `POST /projects/:slug/contribute`, this does *not* require
 * completed onboarding. Joining gates on onboarding because task matching
 * depends on it; ticking a box on a checklist depends on nothing, and
 * blocking it would be a gate with no purpose behind it.
 *
 * A higher rate limit than joining (60/min vs 20/min) because ticking
 * through eight steps in a couple of minutes is the expected use, not a
 * sign of abuse.
 */
contribute.put("/projects/:slug/contribute/progress", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "contribute-progress",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsed = progressSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(c, 400, "invalid_body", "Expected a list of step ids to save");
  }

  try {
    const supabase = getSupabase(env);

    const project = await getProjectDetailBySlug(supabase, slug, null);
    if (!project) {
      return errorResponse(c, 404, "not_found", "This project isn't on DevTunnel");
    }

    const progress = await saveProjectProgress(
      supabase,
      project.id,
      user.id,
      parsed.data.completedSteps,
    );

    return c.json(
      { completedSteps: progress.completedSteps, updatedAt: progress.updatedAt },
      200,
    );
  } catch (err) {
    logger.error("project_contribute_progress_failed", {
      error: err instanceof Error ? err.message : String(err),
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't save your progress right now");
  }
});

/** `PUT /opensource-tools/:slug/contribute/progress` — the same, for a tool. */
contribute.put("/opensource-tools/:slug/contribute/progress", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }
  const slug = c.req.param("slug");

  const withinLimit = await checkRateLimit(c, {
    bucket: "contribute-progress",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsed = progressSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(c, 400, "invalid_body", "Expected a list of step ids to save");
  }

  try {
    const supabase = getSupabase(env);

    const tool = await getOpenSourceToolDetailBySlug(supabase, slug);
    if (!tool) {
      return errorResponse(c, 404, "not_found", "This tool isn't on DevTunnel");
    }

    const progress = await saveToolProgress(
      supabase,
      tool.id,
      user.id,
      parsed.data.completedSteps,
    );

    return c.json(
      { completedSteps: progress.completedSteps, updatedAt: progress.updatedAt },
      200,
    );
  } catch (err) {
    logger.error("tool_contribute_progress_failed", {
      error: err instanceof Error ? err.message : String(err),
      slug,
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't save your progress right now");
  }
});