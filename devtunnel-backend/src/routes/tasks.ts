import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import { getTaskDetailByProjectAndId, getTaskById, listTasks, startTask } from "../db/tasks";
import { getValidGithubAccessToken } from "../db/githubTokens";
import { findExistingFork, forkRepositoryForUser, GitHubForkError } from "../lib/githubFork";

/**
 * Contributor — Tasks (`/tasks` — "Tasks" in `AppSidebar` / `AppBottomNav`,
 * devtunnel-frontend's `lib/tasks/{types,api}.ts`). Mounted directly on the
 * app root in src/index.ts (`app.route("/", tasks)`) — same convention as
 * `/issues` (src/routes/issues.ts): reachable by any signed-in contributor,
 * not just admins.
 *
 * This is the contributor-facing sibling of `GET /admin/tasks`
 * (src/routes/admin/tasks.ts): same underlying `devtunnel.admin_task_list`
 * view (sql/013), same row shape wherever the fields overlap, but scoped
 * to active (non-deleted) tasks only and trimmed to what a contributor
 * browsing for work needs — see src/db/tasks.ts's own doc comment for the
 * full mapping.
 *
 * `requireAuth` only — no `requireAdminRole` / `requirePermission`.
 * Browsing DevTunnel's task list to find something to work on is not an
 * admin action, same reasoning `GET /issues` documents for itself.
 *
 * Query filters (`role`, `difficulty`, `status`, `projectSlug`,
 * `techStack`, `q`) are all optional and additive to the already-shipped
 * frontend contract — `lib/tasks/api.ts`'s `getTasks()` calls this route
 * today with no query params at all and still gets every active task back
 * (rule 4: never break existing functionality). `role` and `difficulty`
 * are validated against the exact same `DeveloperRole` / `ExperienceLevel`
 * enums the onboarding wizard itself uses (`PATCH /auth/onboarding`) —
 * never a second, invented vocabulary — which is also exactly what
 * `TasksExplorer`'s Role/Difficulty filters already assume
 * (devtunnel-frontend/src/components/tasks/tasks-explorer.tsx: "these two
 * filters are literally the same two choices a contributor already made
 * during onboarding").
 *
 * `recommended=true` goes one step further: instead of (or alongside) an
 * explicit `role`/`difficulty`/`techStack` filter, it narrows the list to
 * tasks that overlap the *signed-in contributor's own* onboarding answers
 * (`developerRoles`, `experienceLevel`, `technologies` off `c.get("user")`,
 * already attached by `requireAuth`) — see `ListTasksOptions.matchProfile`
 * in src/db/tasks.ts for the exact matching rule. A contributor who hasn't
 * completed onboarding yet has no profile to match against, so that
 * combination is rejected with a clear 422 rather than silently either
 * returning every task (misleading — it looks like filtering happened) or
 * an empty list (looks like a bug).
 *
 * Also mounts `GET /projects/:projectSlug/tasks/:taskId` — one task's own
 * detail page, the "View Task" destination `TaskRow` / `TasksTable`
 * already link to. See that route's own doc comment below.
 */
export const tasks = new Hono<{ Bindings: Env; Variables: Variables }>();

const taskIdSchema = z.string().uuid("Invalid task id");

const ROLE_VALUES = [
  "FRONTEND",
  "BACKEND",
  "FULL_STACK",
  "DOCUMENTATION",
  "TESTING",
  "DEVOPS",
] as const;
const DIFFICULTY_VALUES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
const STATUS_VALUES = ["OPEN", "IN_PROGRESS", "DONE"] as const;

/**
 * Query validation for `GET /tasks` (rules 14–15: every input is
 * validated server-side). `limit` defaults to 100 to match
 * `fetchAllAdminPages`'s own default page size (devtunnel-frontend's
 * `lib/admin/fetch-all-pages.ts`), which is what `getTasks()` walks this
 * route with; capped at 500 the same way `GET /admin/tasks` caps its own
 * `limit` so the client can never force an unbounded query. `before` is a
 * keyset cursor and must be a real ISO timestamp so the underlying
 * `created_at` comparisons stay well-formed.
 */
const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  before: z.string().datetime({ offset: true }).optional(),
  role: z.enum(ROLE_VALUES).optional(),
  difficulty: z.enum(DIFFICULTY_VALUES).optional(),
  status: z.enum(STATUS_VALUES).optional(),
  projectSlug: z.string().trim().min(1).max(200).optional(),
  techStack: z.string().trim().min(1).max(100).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  recommended: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

/**
 * `GET /tasks` — every active DevTunnel task, newest-updated-first,
 * keyset-paginated exactly like `GET /admin/tasks` / `GET /issues`
 * (`limit`/`before` query params, `X-Next-Cursor` response header).
 *
 * Response body is the raw `TaskSummary[]` array — NOT wrapped in the
 * `{ data: ... }` envelope (src/lib/response.ts) — to match the
 * already-shipped frontend contract in devtunnel-frontend/src/lib/tasks/
 * api.ts (`fetchAllAdminPages<Task>("/tasks")`, which reads each page as
 * a plain array), the same documented exception every other list route in
 * this backend uses (`GET /admin/tasks`, `GET /admin/projects`,
 * `GET /issues`). Error responses still use the standard
 * `{ error: { code, message, requestId } }` envelope.
 */
tasks.get("/tasks", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    // requireAuth already guarantees this — kept for type safety, same
    // pattern used throughout this backend's protected routes.
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  // Cheap indexed-table read on the fast path (no live external scan,
  // unlike GET /issues) — rate limited generously in its own bucket, same
  // limit `GET /admin/tasks` already applies to its own list read.
  const withinLimit = await checkRateLimit(c, {
    bucket: "tasks-list",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  const parsed = listQuerySchema.safeParse({
    limit: c.req.query("limit"),
    before: c.req.query("before"),
    role: c.req.query("role"),
    difficulty: c.req.query("difficulty"),
    status: c.req.query("status"),
    projectSlug: c.req.query("projectSlug"),
    techStack: c.req.query("techStack"),
    q: c.req.query("q"),
    recommended: c.req.query("recommended"),
  });
  if (!parsed.success) {
    return errorResponse(
      c,
      400,
      "invalid_query",
      parsed.error.issues[0]?.message ?? "Invalid query parameters",
    );
  }

  const { limit, before, role, difficulty, status, projectSlug, techStack, q, recommended } =
    parsed.data;

  // A contributor's onboarding profile (developerRoles/experienceLevel/
  // technologies) is what `recommended=true` matches against — with no
  // profile at all (onboarding never completed, every field still empty),
  // "recommended" can't mean anything, so this is rejected explicitly
  // rather than silently degrading to "every task" or "no tasks" (rule
  // 17: don't paper over a caller's request as something it isn't).
  if (
    recommended &&
    (!user.onboardingCompleted ||
      (user.developerRoles.length === 0 &&
        user.experienceLevel === null &&
        user.technologies.length === 0))
  ) {
    return errorResponse(
      c,
      422,
      "onboarding_incomplete",
      "Complete onboarding to see recommended tasks",
    );
  }

  try {
    const supabase = getSupabase(env);

    const { tasks: page, nextCursor } = await listTasks(supabase, {
      limit,
      before: before ?? null,
      role,
      difficulty,
      status,
      projectSlug,
      techStack,
      q,
      matchProfile: recommended
        ? {
            developerRoles: user.developerRoles,
            experienceLevel: user.experienceLevel,
            technologies: user.technologies,
          }
        : undefined,
    });

    if (nextCursor) {
      c.header("X-Next-Cursor", nextCursor);
    }
    return c.json(page, 200);
  } catch (err) {
    logger.error("tasks_list_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load tasks right now");
  }
});

/**
 * `GET /projects/:projectSlug/tasks/:taskId` — the contributor-facing
 * "View Task" destination `TaskRow` (devtunnel-frontend's
 * `components/home/task-row.tsx`) and `TasksTable`
 * (`components/tasks/tasks-table.tsx`) already link to. The single-task
 * sibling of `GET /tasks` above, same relationship
 * `GET /admin/tasks/:id` has to `GET /admin/tasks`.
 *
 * `requireAuth` only, same reasoning as `GET /tasks` — reading one task's
 * detail page to decide whether to pick it up is not an admin action.
 *
 * Both `projectSlug` and `taskId` are part of the lookup (see
 * `getTaskDetailByProjectAndId`'s own comment) — a task id that's real
 * but doesn't belong to `projectSlug` 404s exactly like an id that
 * doesn't exist at all, rather than silently ignoring the URL's project
 * segment.
 */
tasks.get("/projects/:projectSlug/tasks/:taskId", requireAuth, async (c) => {
  const env = getEnv(c.env);

  const projectSlug = c.req.param("projectSlug")?.trim();
  const taskIdResult = taskIdSchema.safeParse(c.req.param("taskId"));

  if (!projectSlug) {
    return errorResponse(c, 400, "invalid_request", "Invalid project slug");
  }
  if (!taskIdResult.success) {
    return errorResponse(c, 400, "invalid_request", taskIdResult.error.issues[0]!.message);
  }

  const withinLimit = await checkRateLimit(c, {
    bucket: "tasks-detail",
    limit: 120,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);
    const task = await getTaskDetailByProjectAndId(supabase, projectSlug, taskIdResult.data);
    if (!task) {
      return errorResponse(c, 404, "task_not_found", "Task not found");
    }
    return c.json(task, 200);
  } catch (err) {
    logger.error("task_detail_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load this task right now");
  }
});

/**
 * Turns a task's title into the slug half of a CONTRIBUTING.md-style
 * branch name (`feature/short-description`) — lowercase, hyphenated,
 * stripped of anything that isn't alphanumeric/hyphen, capped so the
 * branch name stays reasonable. Never empty: a title that's entirely
 * punctuation/emoji falls back to the task's own id.
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
 * CONTRIBUTING.md's four branch prefixes (`feature/`, `fix/`, `docs/`,
 * `chore/`) — `dev start` has to pick one on the contributor's behalf
 * since there's no interactive prompt in a single non-interactive
 * command. `DOCUMENTATION`-only tasks get `docs/`; everything else
 * (including mixed-role and unroled tasks) defaults to `feature/`, the
 * same "new functionality" default CONTRIBUTING.md's own worked example
 * (`git checkout -b feature/short-description`) uses. Getting this exactly
 * right isn't safety-critical — a contributor can always rename the
 * branch locally before `dev submit` opens the PR.
 */
function branchPrefixForTask(roles: string[] | null): "feature" | "docs" {
  if (roles && roles.length > 0 && roles.every((role) => role === "DOCUMENTATION")) {
    return "docs";
  }
  return "feature";
}

/**
 * `POST /tasks/:id/start` — the backend half of `dev start <task-id>`
 * (devtunnel-cli's `src/commands/start.ts`). Does the fork server-side,
 * using the contributor's own stored GitHub OAuth token
 * (`getValidGithubAccessToken`, db/githubTokens.ts — same token
 * `GET /users/me/contributions` and the Star action already use), then
 * atomically claims the task (`devtunnel.start_task`, sql/030) recording
 * the fork and the branch name the CLI is about to check out.
 *
 * `requireAuth` accepts both the browser session cookie and a CLI bearer
 * token (src/middleware/auth.ts) — this route needs no bearer-specific
 * code of its own, it just runs behind the same middleware every other
 * protected route does.
 *
 * Idempotent for the same contributor re-running `dev start` on a task
 * they already claimed: `startTask` (db/tasks.ts) resolves that by
 * returning the already-recorded fork/branch rather than erroring, and
 * this route skips the GitHub fork call entirely when
 * `findExistingFork` already finds one — a second `dev start` shouldn't
 * cost a second GitHub round trip when nothing has to change.
 */
tasks.post("/tasks/:id/start", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  const taskIdResult = taskIdSchema.safeParse(c.req.param("id"));
  if (!taskIdResult.success) {
    return errorResponse(c, 400, "invalid_request", taskIdResult.error.issues[0]!.message);
  }
  const taskId = taskIdResult.data;

  const withinLimit = await checkRateLimit(c, {
    bucket: "tasks-start",
    limit: 10,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);

    const task = await getTaskById(supabase, taskId);
    if (!task) {
      return errorResponse(c, 404, "task_not_found", "Task not found");
    }
    if (!task.project_github_owner || !task.project_github_full_name) {
      return errorResponse(
        c,
        422,
        "project_not_github_backed",
        "This task's project has no linked GitHub repository",
      );
    }

    // Same contributor resuming a task they already claimed — the branch
    // is already decided (recorded at claim time), so reuse it rather
    // than deriving a fresh one that would diverge from what's actually
    // checked out locally.
    const alreadyMine = task.assignee_id === user.id && task.assignee_fork_full_name && task.assignee_branch;

    const accessToken = await getValidGithubAccessToken(supabase, env, user.id);
    if (!accessToken) {
      return errorResponse(
        c,
        403,
        "github_reauth_required",
        "Reconnect your GitHub account to start a task",
      );
    }

    const [owner, repo] = task.project_github_full_name.split("/");
    if (!owner || !repo) {
      return errorResponse(c, 422, "project_not_github_backed", "Malformed repository reference");
    }

    let fork = alreadyMine ? null : await findExistingFork(accessToken, owner, repo);
    if (!fork && !alreadyMine) {
      fork = await forkRepositoryForUser(accessToken, owner, repo);
    }

    const forkFullName = alreadyMine ? task.assignee_fork_full_name! : fork!.fullName;
    const branch = alreadyMine
      ? task.assignee_branch!
      : `${branchPrefixForTask(task.roles)}/${slugifyForBranch(task.title, taskId)}`;

    const outcome = await startTask(supabase, taskId, user.id, forkFullName, branch);

    if (outcome.status === "not_found") {
      return errorResponse(c, 404, "task_not_found", "Task not found");
    }
    if (outcome.status === "already_claimed") {
      return errorResponse(
        c,
        409,
        "task_already_claimed",
        "Someone else already started this task",
      );
    }
    if (outcome.status === "already_done") {
      return errorResponse(c, 409, "task_already_done", "This task is already done");
    }

    return c.json(
      {
        data: {
          taskId: outcome.task.id,
          status: outcome.task.status,
          fork: {
            fullName: outcome.task.assigneeForkFullName,
            cloneUrl: `https://github.com/${outcome.task.assigneeForkFullName}.git`,
            htmlUrl: `https://github.com/${outcome.task.assigneeForkFullName}`,
          },
          upstream: {
            fullName: task.project_github_full_name,
            cloneUrl: `https://github.com/${task.project_github_full_name}.git`,
          },
          branch: outcome.task.assigneeBranch,
          startedAt: outcome.task.assigneeStartedAt,
        },
      },
      200,
    );
  } catch (err) {
    if (err instanceof GitHubForkError) {
      const status = err.reason === "rate_limited" ? 429 : err.reason === "unauthorized" ? 403 : 502;
      return errorResponse(c, status, `github_${err.reason}`, err.message);
    }
    logger.error("task_start_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't start this task right now");
  }
});