import { Hono } from "hono";
import { z } from "zod";
import type { Env, Variables } from "../types";
import { getEnv } from "../config/env";
import { getSupabase } from "../lib/supabase";
import { requireAuth } from "../middleware/auth";
import { checkRateLimit } from "../lib/rateLimit";
import { errorResponse } from "../lib/response";
import { logger } from "../lib/logger";
import {
  getTaskDetailByProjectAndId,
  getTaskById,
  listTasks,
  listTasksAssignedToUser,
  startTask,
  submitTask,
} from "../db/tasks";
import { getValidGithubAccessToken } from "../db/githubTokens";
import { findExistingFork, forkRepositoryForUser, GitHubForkError } from "../lib/githubFork";
import {
  createPullRequest,
  fetchDefaultBranch,
  findOpenPullRequest,
  GitHubPullRequestError,
} from "../lib/githubPullRequest";

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

/** Upper bound on `GET /users/me/tasks` — a personal dashboard list, not a paginated collection (rule 40). */
const MY_TASKS_LIMIT = 30;

const ROLE_VALUES = [
  "FRONTEND",
  "BACKEND",
  "FULL_STACK",
  "DOCUMENTATION",
  "TESTING",
  "DEVOPS",
] as const;
const DIFFICULTY_VALUES = ["BEGINNER", "INTERMEDIATE", "ADVANCED"] as const;
const STATUS_VALUES = ["OPEN", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export const COMMIT_TYPE_VALUES = ["feat", "fix", "docs", "chore"] as const;

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
 *
 * The payload carries a `progress` block (`TaskProgress`, src/db/tasks.ts)
 * for the task-progress tracker: whether *this viewer* is the one who
 * claimed the task, when it was started, and the pull request `dev
 * submit` opened. The response is therefore per-viewer — the signed-in
 * user's id is passed down for exactly that — and must not be cached
 * across viewers.
 */
tasks.get("/projects/:projectSlug/tasks/:taskId", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

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
    const task = await getTaskDetailByProjectAndId(supabase, projectSlug, taskIdResult.data, user.id);
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
 * `GET /users/me/tasks` — the tasks the signed-in contributor has claimed
 * with `dev start`, each with its current stage, for the Home page's
 * "My tasks" list (devtunnel-frontend's `components/home/my-tasks-list.tsx`
 * via `getMyTasks` in `lib/home/api.ts`).
 *
 * Replaces the placeholder `GET /contributor/tasks?assignedToMe=true` that
 * list used to call, which was never built — so "My tasks" always showed
 * its "not available yet" message. This route is what makes it real.
 *
 * `requireAuth` only. Scoped to `user.id` inside the query itself
 * (`listTasksAssignedToUser`), so there is no parameter a caller could
 * change to read someone else's claims. Bare array response, same as
 * `GET /tasks`, because that's what the Home page's fetch helper expects;
 * an empty array is the normal "nothing claimed yet" answer, not an error.
 * Registered under `/users/me/…` alongside `GET /users/me/contributions`.
 */
tasks.get("/users/me/tasks", requireAuth, async (c) => {
  const env = getEnv(c.env);
  const user = c.get("user");
  if (!user) {
    return errorResponse(c, 401, "unauthenticated", "Sign-in required");
  }

  const withinLimit = await checkRateLimit(c, {
    bucket: "tasks-mine",
    limit: 60,
    windowSeconds: 60,
  });
  if (!withinLimit) {
    return errorResponse(c, 429, "rate_limited", "Too many requests. Try again shortly.");
  }

  try {
    const supabase = getSupabase(env);
    const items = await listTasksAssignedToUser(supabase, user.id, MY_TASKS_LIMIT);
    return c.json(items, 200);
  } catch (err) {
    logger.error("my_tasks_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't load your tasks right now");
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

export const submitBodySchema = z.object({
  /** Current local branch, as `dev submit`'s own `git status` sees it — cross-checked against `assignee_branch` below so a submit from the wrong checkout fails clearly instead of opening a PR from the wrong branch. */
  branch: z.string().trim().min(1).max(250),
  /** PR title — the CLI's own most recent commit subject, unless the contributor typed something else. */
  title: z.string().trim().min(1).max(200),
  type: z.enum(COMMIT_TYPE_VALUES),
  /** Commit subjects ahead of the upstream default branch, oldest first — becomes the PR body's "Changes Made" list. */
  commits: z.array(z.string().trim().min(1).max(300)).min(1).max(30),
  testedNote: z.string().trim().max(500).optional(),
});

/**
 * Renders a PR body that fills in `.github/PULL_REQUEST_TEMPLATE.md`
 * (docs/.github/PULL_REQUEST_TEMPLATE.md) field-for-field, so a PR opened
 * by `dev submit` looks like one a contributor filled out by hand rather
 * than an obviously-automated one with a different shape. Checklist items
 * are left unchecked across the board — `dev submit` has no way to verify
 * "I have signed the CLA" or "All existing and new tests pass" are true,
 * and ticking a box it can't back up would be worse than leaving it for
 * the contributor to confirm on GitHub.
 */
export function buildPullRequestBody(args: {
  type: (typeof COMMIT_TYPE_VALUES)[number];
  commits: string[];
  testedNote: string | null;
  githubIssueNumber: number | null;
}): string {
  const { type, commits, testedNote, githubIssueNumber } = args;
  const checkbox = (label: string, checked: boolean) => `- [${checked ? "x" : " "}] ${label}`;

  return [
    "## Description",
    "",
    "Opened by `dev submit` (DevTunnel CLI).",
    "",
    "## Related Issue",
    "",
    githubIssueNumber ? `Closes #${githubIssueNumber}` : "_No linked issue._",
    "",
    "## Type of Change",
    "",
    checkbox("Bug fix", type === "fix"),
    checkbox("New feature", type === "feat"),
    checkbox("Documentation update", type === "docs"),
    checkbox("Refactor / chore", type === "chore"),
    "",
    "## Changes Made",
    "",
    ...commits.map((subject) => `- ${subject}`),
    "",
    "## How Has This Been Tested?",
    "",
    testedNote ?? "_Not specified — run `dev test` locally before merging._",
    "",
    "## Checklist",
    "",
    checkbox("I have read the CONTRIBUTING.md guide", false),
    checkbox("I have signed the CLA", false),
    checkbox("My code follows the project's style guidelines", false),
    checkbox("I have updated documentation where relevant", false),
    checkbox("I have added tests where applicable", false),
    checkbox("All existing and new tests pass", false),
  ].join("\n");
}

/**
 * `POST /tasks/:id/submit` — the backend half of `dev submit <task-id>`
 * (devtunnel-cli's `src/commands/submit.ts`). By the time this is called,
 * the CLI has already committed and pushed the contributor's branch to
 * their fork (the same fork/branch `dev start` recorded) — this route's
 * job is to open the pull request server-side, using the contributor's
 * own stored GitHub OAuth token, and record it against the task.
 *
 * Only the contributor who ran `dev start` on this task can `dev submit`
 * it (`task_not_yours`) — same one-claim-one-contributor model
 * `POST /tasks/:id/start` already enforces, just checked in the other
 * direction. A task that was never started at all (`assignee_id` still
 * null) gets its own clearer error rather than being folded into
 * `task_not_yours`, so the contributor knows to run `dev start` first
 * rather than wondering whose task this is.
 *
 * `branch` in the body is a sanity check, not the source of truth: it
 * must match `assignee_branch` (recorded at `dev start` time) or the
 * request is rejected with `branch_mismatch` — this is what catches
 * "ran `dev submit` from the wrong directory" before it opens a PR from
 * a branch nobody meant to submit.
 *
 * Idempotent the same way `dev start` is: re-running `dev submit` on a
 * task that already has an open PR (new commits pushed since) finds that
 * PR (`findOpenPullRequest`) instead of asking GitHub to open a second one
 * for the same branch, and `submitTask` (db/tasks.ts) updates DevTunnel's
 * own record of it in place rather than creating a duplicate.
 */
tasks.post("/tasks/:id/submit", requireAuth, async (c) => {
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
    bucket: "tasks-submit",
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
    if (!task.assignee_id || !task.assignee_fork_full_name || !task.assignee_branch) {
      return errorResponse(
        c,
        409,
        "task_not_started",
        "Run `dev start` on this task before submitting",
      );
    }
    if (task.assignee_id !== user.id) {
      return errorResponse(c, 403, "task_not_yours", "This task was started by someone else");
    }
    if (task.status === "DONE") {
      return errorResponse(c, 409, "task_already_done", "This task is already done");
    }
    if (task.assignee_branch !== branch) {
      return errorResponse(
        c,
        409,
        "branch_mismatch",
        `Expected branch "${task.assignee_branch}" for this task, but "${branch}" is checked out`,
      );
    }

    const accessToken = await getValidGithubAccessToken(supabase, env, user.id);
    if (!accessToken) {
      return errorResponse(
        c,
        403,
        "github_reauth_required",
        "Reconnect your GitHub account to submit this task",
      );
    }

    const [upstreamOwner, upstreamRepo] = task.project_github_full_name.split("/");
    const [forkOwner] = task.assignee_fork_full_name.split("/");
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
            githubIssueNumber: task.github_issue_number,
          }),
        })
      ).pr;

    const outcome = await submitTask(supabase, taskId, user.id, {
      prUrl: pr.htmlUrl,
      prNumber: pr.number,
      branch,
      title,
    });

    if (outcome.status === "not_found") {
      return errorResponse(c, 404, "task_not_found", "Task not found");
    }
    if (outcome.status === "not_yours") {
      return errorResponse(c, 403, "task_not_yours", "This task was started by someone else");
    }
    if (outcome.status === "already_done") {
      return errorResponse(c, 409, "task_already_done", "This task is already done");
    }

    return c.json(
      {
        data: {
          taskId: outcome.task.id,
          status: outcome.task.status,
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
    logger.error("task_submit_failed", {
      error: err instanceof Error ? err.message : String(err),
      requestId: c.get("requestId"),
    });
    return errorResponse(c, 500, "internal_error", "Couldn't submit this task right now");
  }
});