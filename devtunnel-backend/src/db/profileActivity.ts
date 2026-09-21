import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Profile — "what have I done on DevTunnel?"
 *
 * Backs `GET /users/me/profile-activity` and `POST /tasks/:id/view`
 * (src/routes/profileActivity.ts), and through them the Profile page's
 * **Projects** and **Tasks** tabs (devtunnel-frontend
 * `components/profile/profile-tabs.tsx`).
 *
 * **Every fact is read from a table that already records it** — nothing is
 * inferred, and nothing is counted from GitHub:
 *
 *  - tasks I *saw*               — `task_views` (sql/036), written when the task page is opened
 *  - tasks I *started*           — `tasks.assignee_started_at` / `assignee_id` (`dev start`, sql/030)
 *  - tasks I *submitted*         — `pull_requests.created_at` (`dev submit`, sql/031), task at `IN_REVIEW`
 *  - tasks I *finished*          — `tasks.completed_at` on a `DONE` task (sql/004)
 *  - projects I *joined*         — `project_contributors` (the "Contribute to this project" button, sql/026)
 *  - tools I *joined*            — `opensource_tool_contributors` (sql/026)
 *  - GitHub repositories I joined — `github_repo_contributors` (the raw catalogs' "Contribute" button, sql/036)
 *  - projects I *claimed whole*  — `projects.assignee_id` (`dev start --project`, sql/032)
 *
 * **A project is "Contributing", not just "Joined", once there is work in
 * it** — a task started / submitted / finished, or the whole project claimed.
 * Someone can start a task from the CLI without ever pressing the Contribute
 * button, and that project should still appear under their profile; it just
 * has no `joinedAt`. Joining alone is intent (sql/026 is explicit that it
 * never counts as delivered work), so it reads "Joined".
 *
 * **One row per task, showing the furthest stage reached.** A task that was
 * viewed, started and submitted is one row at "PR submitted" — with all
 * three timestamps attached — not three rows.
 *
 * Every query is scoped to `userId` inside the query itself, so there is no
 * parameter a caller could change to read anyone else's activity (rule 17),
 * and every read is bounded (rule 40).
 */

export type ProfileTaskStage = "VIEWED" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";

export interface ProfileTaskItem {
  taskId: string;
  title: string;
  projectSlug: string;
  projectName: string;
  /** Furthest stage the viewer has reached on this task. */
  stage: ProfileTaskStage;
  /** Last time the viewer opened the task page. */
  viewedAt: string | null;
  /** `dev start`. */
  startedAt: string | null;
  /** `dev submit` — when the pull request was opened. */
  submittedAt: string | null;
  /** The task reached `DONE`. */
  completedAt: string | null;
  pullRequest: { number: number | null; url: string | null } | null;
  /** The newest of the timestamps above — what the list is sorted by. */
  occurredAt: string;
}

export type ProfileProjectKind = "project" | "tool" | "github-project" | "github-tool";

export interface ProfileProjectTaskCounts {
  /** Tasks the viewer opened but has not started. */
  viewed: number;
  inProgress: number;
  inReview: number;
  done: number;
}

export interface ProfileProjectItem {
  /** Stable per entry (`kind:identifier`), safe as a React key. */
  id: string;
  kind: ProfileProjectKind;
  /** DevTunnel slug for `project`/`tool`; the catalog slug (`owner--repo`) for GitHub entries. */
  slug: string;
  name: string;
  primaryTech: string | null;
  repositoryFullName: string | null;
  /** When they pressed Contribute. `null` when they're contributing without ever having joined. */
  joinedAt: string | null;
  status: "JOINED" | "CONTRIBUTING";
  /** Only for `kind: "project"` — tools and raw GitHub repositories have no DevTunnel tasks. */
  taskCounts: ProfileProjectTaskCounts | null;
  /** The newest thing the viewer did here — what the list is sorted by. */
  lastActivityAt: string;
}

export interface ProfileActivity {
  projects: ProfileProjectItem[];
  tasks: ProfileTaskItem[];
}

/**
 * Upper bound on rows read per source (rule 40). A profile shows the
 * contributor's recent work, so only someone with more than this many of one
 * kind could ever have an older one left out — not worth an unbounded query.
 */
const SCAN_LIMIT = 100;
const MEMBERSHIP_LIMIT = 50;

interface TaskViewRow {
  task_id: string;
  last_viewed_at: string;
}

interface TaskRow {
  id: string;
  title: string;
  status: string;
  project_id: string;
  created_at: string;
  assignee_started_at: string | null;
  completed_at: string | null;
}

interface PullRequestRow {
  task_id: string | null;
  github_pr_url: string | null;
  github_pr_number: number | null;
  created_at: string;
}

interface ProjectMembershipRow {
  project_id: string;
  joined_at: string;
}

interface ToolMembershipRow {
  tool_id: string;
  joined_at: string;
}

interface GithubMembershipRow {
  catalog: "project" | "tool";
  repository_key: string;
  repository_full_name: string;
  joined_at: string;
}

interface ClaimedProjectRow {
  id: string;
  assignee_started_at: string | null;
}

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  primary_language: string | null;
  github_full_name: string | null;
}

interface ToolRow {
  id: string;
  slug: string;
  name: string;
  primary_language: string | null;
  source_url: string | null;
}

function latest(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (best === null || Date.parse(value) > Date.parse(best)) best = value;
  }
  return best;
}

/**
 * The stage a task is at *for this viewer*. Only a task the viewer claimed
 * (`assignee_id`) can be past "viewed" — a task someone else started, or one
 * that is done because someone else finished it, is still just "viewed" from
 * here. An assigned task whose status is still `OPEN` shouldn't exist
 * (`start_task`, sql/030, moves it to `IN_PROGRESS` in the same statement);
 * if one does, it is shown as viewed rather than as work in progress.
 */
function stageForViewer(status: string, claimedByViewer: boolean): ProfileTaskStage {
  if (!claimedByViewer) return "VIEWED";
  if (status === "IN_PROGRESS") return "IN_PROGRESS";
  if (status === "IN_REVIEW") return "IN_REVIEW";
  if (status === "DONE") return "DONE";
  return "VIEWED";
}

/**
 * Records that `userId` opened `taskId`'s page. Idempotent by construction
 * (rule 55): the composite primary key means a refresh, a double-invoked
 * effect or two open tabs all land on the same row. On a repeat view only
 * `last_viewed_at` moves — the upsert names only the columns it wants to
 * change, so `first_viewed_at` keeps saying when the viewer first saw it.
 *
 * Returns `false` for a task that doesn't exist or has been soft-deleted, so
 * the route can answer 404 rather than store a view of nothing.
 */
export async function recordTaskView(
  supabase: SupabaseClient,
  taskId: string,
  userId: string,
): Promise<boolean> {
  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", taskId)
    .is("deleted_at", null)
    .maybeSingle();

  if (taskError) throw new Error(`Failed to look up task: ${taskError.message}`);
  if (!task) return false;

  const { error } = await supabase
    .from("task_views")
    .upsert(
      { task_id: taskId, user_id: userId, last_viewed_at: new Date().toISOString() },
      { onConflict: "task_id,user_id" },
    );

  if (error) throw new Error(`Failed to record task view: ${error.message}`);
  return true;
}

export async function getProfileActivity(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProfileActivity> {
  const [
    viewsResult,
    assignedResult,
    pullRequestsResult,
    projectMembershipsResult,
    toolMembershipsResult,
    githubMembershipsResult,
    claimedProjectsResult,
  ] = await Promise.all([
    supabase
      .from("task_views")
      .select("task_id, last_viewed_at")
      .eq("user_id", userId)
      .order("last_viewed_at", { ascending: false })
      .limit(SCAN_LIMIT),
    supabase
      .from("tasks")
      .select("id, title, status, project_id, created_at, assignee_started_at, completed_at")
      .eq("assignee_id", userId)
      .is("deleted_at", null)
      .order("assignee_started_at", { ascending: false, nullsFirst: false })
      .limit(SCAN_LIMIT),
    supabase
      .from("pull_requests")
      .select("task_id, github_pr_url, github_pr_number, created_at")
      .eq("author_id", userId)
      .not("task_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(SCAN_LIMIT),
    supabase
      .from("project_contributors")
      .select("project_id, joined_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(MEMBERSHIP_LIMIT),
    supabase
      .from("opensource_tool_contributors")
      .select("tool_id, joined_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(MEMBERSHIP_LIMIT),
    supabase
      .from("github_repo_contributors")
      .select("catalog, repository_key, repository_full_name, joined_at")
      .eq("user_id", userId)
      .order("joined_at", { ascending: false })
      .limit(MEMBERSHIP_LIMIT),
    supabase
      .from("projects")
      .select("id, assignee_started_at")
      .eq("assignee_id", userId)
      .is("deleted_at", null)
      .limit(MEMBERSHIP_LIMIT),
  ]);

  if (viewsResult.error) {
    throw new Error(`Failed to load your viewed tasks: ${viewsResult.error.message}`);
  }
  if (assignedResult.error) {
    throw new Error(`Failed to load your started tasks: ${assignedResult.error.message}`);
  }
  if (pullRequestsResult.error) {
    throw new Error(`Failed to load your pull requests: ${pullRequestsResult.error.message}`);
  }
  if (projectMembershipsResult.error) {
    throw new Error(`Failed to load your joined projects: ${projectMembershipsResult.error.message}`);
  }
  if (toolMembershipsResult.error) {
    throw new Error(`Failed to load your joined tools: ${toolMembershipsResult.error.message}`);
  }
  if (githubMembershipsResult.error) {
    throw new Error(
      `Failed to load your joined repositories: ${githubMembershipsResult.error.message}`,
    );
  }
  if (claimedProjectsResult.error) {
    throw new Error(`Failed to load your claimed projects: ${claimedProjectsResult.error.message}`);
  }

  const viewRows = (viewsResult.data ?? []) as unknown as TaskViewRow[];
  const assignedRows = (assignedResult.data ?? []) as unknown as TaskRow[];
  const pullRequestRows = (pullRequestsResult.data ?? []) as unknown as PullRequestRow[];
  const projectMembershipRows = (projectMembershipsResult.data ?? []) as unknown as ProjectMembershipRow[];
  const toolMembershipRows = (toolMembershipsResult.data ?? []) as unknown as ToolMembershipRow[];
  const githubMembershipRows = (githubMembershipsResult.data ?? []) as unknown as GithubMembershipRow[];
  const claimedProjectRows = (claimedProjectsResult.data ?? []) as unknown as ClaimedProjectRow[];

  // --- Tasks the viewer only *looked at* --------------------------------
  // Tasks they claimed are already in `assignedRows`; anything else they
  // viewed needs its own row read for a title and project.
  const assignedIds = new Set(assignedRows.map((row) => row.id));
  const viewedOnlyIds = viewRows.map((row) => row.task_id).filter((id) => !assignedIds.has(id));

  let viewedOnlyRows: TaskRow[] = [];
  if (viewedOnlyIds.length > 0) {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title, status, project_id, created_at, assignee_started_at, completed_at")
      .in("id", viewedOnlyIds)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to load your viewed tasks: ${error.message}`);
    viewedOnlyRows = (data ?? []) as unknown as TaskRow[];
  }

  const viewedAtByTask = new Map<string, string>(
    viewRows.map((row) => [row.task_id, row.last_viewed_at]),
  );

  const pullRequestByTask = new Map<string, PullRequestRow>();
  for (const row of pullRequestRows) {
    // Newest first, so the first one seen per task is the latest.
    if (row.task_id && !pullRequestByTask.has(row.task_id)) {
      pullRequestByTask.set(row.task_id, row);
    }
  }

  // --- Names/slugs for every project and tool that will be shown ---------
  const projectIds = new Set<string>();
  for (const row of assignedRows) projectIds.add(row.project_id);
  for (const row of viewedOnlyRows) projectIds.add(row.project_id);
  for (const row of projectMembershipRows) projectIds.add(row.project_id);
  for (const row of claimedProjectRows) projectIds.add(row.id);

  const projectsById = new Map<string, ProjectRow>();
  if (projectIds.size > 0) {
    const { data, error } = await supabase
      .from("projects")
      .select("id, slug, name, primary_language, github_full_name")
      .in("id", Array.from(projectIds))
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to load your projects: ${error.message}`);
    for (const row of (data ?? []) as unknown as ProjectRow[]) projectsById.set(row.id, row);
  }

  const toolsById = new Map<string, ToolRow>();
  if (toolMembershipRows.length > 0) {
    const { data, error } = await supabase
      .from("opensource_tools")
      .select("id, slug, name, primary_language, source_url")
      .in("id", toolMembershipRows.map((row) => row.tool_id));
    if (error) throw new Error(`Failed to load your tools: ${error.message}`);
    for (const row of (data ?? []) as unknown as ToolRow[]) toolsById.set(row.id, row);
  }

  // --- Tasks ---------------------------------------------------------------
  // A task in a project that has since been soft-deleted is dropped: its
  // link would only lead to a 404.
  const tasks: ProfileTaskItem[] = [];
  /** Which project each listed task belongs to, by id — the Projects section groups on this. */
  const projectIdByTask = new Map<string, string>();

  function pushTask(row: TaskRow, claimedByViewer: boolean): void {
    const project = projectsById.get(row.project_id);
    if (!project) return;

    const stage = stageForViewer(row.status, claimedByViewer);
    const pullRequest = claimedByViewer ? (pullRequestByTask.get(row.id) ?? null) : null;

    const viewedAt = viewedAtByTask.get(row.id) ?? null;
    const startedAt = claimedByViewer ? row.assignee_started_at : null;
    const submittedAt = pullRequest ? pullRequest.created_at : null;
    const completedAt = claimedByViewer && stage === "DONE" ? row.completed_at : null;

    projectIdByTask.set(row.id, row.project_id);
    tasks.push({
      taskId: row.id,
      title: row.title,
      projectSlug: project.slug,
      projectName: project.name,
      stage,
      viewedAt,
      startedAt,
      submittedAt,
      completedAt,
      pullRequest: pullRequest
        ? { number: pullRequest.github_pr_number, url: pullRequest.github_pr_url }
        : null,
      occurredAt: latest(viewedAt, startedAt, submittedAt, completedAt) ?? row.created_at,
    });
  }

  for (const row of assignedRows) pushTask(row, true);
  for (const row of viewedOnlyRows) pushTask(row, false);

  tasks.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  // --- Projects --------------------------------------------------------------
  const tasksByProject = new Map<string, ProfileTaskItem[]>();
  for (const task of tasks) {
    const projectId = projectIdByTask.get(task.taskId);
    if (!projectId) continue;
    const list = tasksByProject.get(projectId) ?? [];
    list.push(task);
    tasksByProject.set(projectId, list);
  }

  const joinedAtByProject = new Map<string, string>(
    projectMembershipRows.map((row) => [row.project_id, row.joined_at]),
  );
  const claimedStartedAtByProject = new Map<string, string | null>(
    claimedProjectRows.map((row) => [row.id, row.assignee_started_at]),
  );

  // Every project the viewer has joined, claimed whole, or started work in.
  // A project they merely *viewed* tasks of is not listed — that's in the
  // Tasks tab; the Projects tab is for the ones they took part in.
  const participatingProjectIds = new Set<string>([
    ...joinedAtByProject.keys(),
    ...claimedStartedAtByProject.keys(),
  ]);
  for (const task of tasks) {
    if (task.stage === "VIEWED") continue;
    const projectId = projectIdByTask.get(task.taskId);
    if (projectId) participatingProjectIds.add(projectId);
  }

  const projects: ProfileProjectItem[] = [];

  for (const projectId of participatingProjectIds) {
    const project = projectsById.get(projectId);
    if (!project) continue;

    const projectTasks = tasksByProject.get(projectId) ?? [];
    const taskCounts: ProfileProjectTaskCounts = {
      viewed: projectTasks.filter((task) => task.stage === "VIEWED").length,
      inProgress: projectTasks.filter((task) => task.stage === "IN_PROGRESS").length,
      inReview: projectTasks.filter((task) => task.stage === "IN_REVIEW").length,
      done: projectTasks.filter((task) => task.stage === "DONE").length,
    };

    const hasWork =
      taskCounts.inProgress + taskCounts.inReview + taskCounts.done > 0 ||
      claimedStartedAtByProject.has(projectId);
    const joinedAt = joinedAtByProject.get(projectId) ?? null;

    projects.push({
      id: `project:${project.id}`,
      kind: "project",
      slug: project.slug,
      name: project.name,
      primaryTech: project.primary_language,
      repositoryFullName: project.github_full_name,
      joinedAt,
      status: hasWork ? "CONTRIBUTING" : "JOINED",
      taskCounts,
      lastActivityAt:
        latest(
          joinedAt,
          claimedStartedAtByProject.get(projectId),
          ...projectTasks.map((task) => task.occurredAt),
        ) ?? new Date(0).toISOString(),
    });
  }

  for (const row of toolMembershipRows) {
    const tool = toolsById.get(row.tool_id);
    if (!tool) continue;
    projects.push({
      id: `tool:${tool.id}`,
      kind: "tool",
      slug: tool.slug,
      name: tool.name,
      primaryTech: tool.primary_language,
      repositoryFullName: null,
      joinedAt: row.joined_at,
      status: "JOINED",
      taskCounts: null,
      lastActivityAt: row.joined_at,
    });
  }

  for (const row of githubMembershipRows) {
    const [, repoName = row.repository_full_name] = row.repository_full_name.split("/");
    projects.push({
      id: `github-${row.catalog}:${row.repository_key}`,
      kind: row.catalog === "project" ? "github-project" : "github-tool",
      // The catalog's own slug encoding (`lib/githubCatalog.ts`), so the
      // frontend can link straight to `/github-projects/:slug`.
      slug: row.repository_key.replace("/", "--"),
      name: repoName,
      primaryTech: null,
      repositoryFullName: row.repository_full_name,
      joinedAt: row.joined_at,
      status: "JOINED",
      taskCounts: null,
      lastActivityAt: row.joined_at,
    });
  }

  projects.sort((a, b) => Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt));

  return { projects, tasks };
}