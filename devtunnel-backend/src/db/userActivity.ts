import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Home — "Recently active" (`GET /users/me/activity`,
 * src/routes/userActivity.ts). What the signed-in contributor has recently
 * *done* on DevTunnel: tasks they started, pull requests they submitted,
 * tasks they finished, and whole projects they claimed.
 *
 * **Every event is read from a table that already records it** — nothing
 * here is inferred or counted from GitHub:
 *
 *  - `TASK_STARTED`            — `tasks.assignee_started_at` (`dev start`, sql/030)
 *  - `PULL_REQUEST_SUBMITTED`  — `pull_requests.created_at` (`dev submit`, sql/031/033)
 *  - `TASK_COMPLETED`          — `tasks.completed_at` on a `DONE` task (sql/004 trigger)
 *  - `PROJECT_STARTED`         — `projects.assignee_started_at` (`dev start --project`, sql/032)
 *
 * Why not `devtunnel.activity_log` (sql/004), which already exists? It only
 * holds `PROJECT_CREATED` / `TASK_COMPLETED` / `PULL_REQUEST_MERGED` and
 * exists to feed the profile's contribution calendar. `dev start` and `dev
 * submit` — the events a contributor most wants to see right after doing them
 * — are not in it, and adding them would change every calendar count. So this
 * reads the source tables directly instead, which also means it can never
 * drift from what those tables say.
 *
 * "Merged" is deliberately not an event here. As `lib/tasks/progress.ts` in
 * the frontend explains, DevTunnel does not observe the merge itself, so the
 * only completion signal shown is the task reaching `DONE`.
 *
 * **One row per thing worked on, showing its latest event.** A task that was
 * started, then submitted, then finished would otherwise fill the whole list
 * with three rows about the same task. Collapsing to the latest event per
 * task (or per project-level claim) keeps the list a real "what have I been
 * working on" view.
 */

export type RecentActivityType =
  | "TASK_STARTED"
  | "PULL_REQUEST_SUBMITTED"
  | "TASK_COMPLETED"
  | "PROJECT_STARTED";

export interface RecentActivityItem {
  /** Stable per event (`type:subject`), safe as a React key. */
  id: string;
  type: RecentActivityType;
  /** The task's title, or the project's name for project-level events. */
  title: string;
  projectSlug: string;
  projectName: string;
  /** Set for task-level events; `null` for project-level ones (links go to the project instead). */
  taskId: string | null;
  /** ISO 8601. */
  occurredAt: string;
  /** Only on `PULL_REQUEST_SUBMITTED`. */
  pullRequest: { number: number | null; url: string | null } | null;
}

/**
 * Upper bound on rows read per source table (rule 40). The result is the
 * newest handful of events, so only a contributor with more than this many
 * claims *and* an old one that was just finished could ever have an event
 * missed — not a case worth an unbounded query.
 */
const SCAN_LIMIT = 50;

interface TaskRow {
  id: string;
  title: string;
  status: string;
  project_id: string;
  assignee_started_at: string | null;
  completed_at: string | null;
}

interface PullRequestRow {
  id: string;
  project_id: string;
  task_id: string | null;
  github_pr_url: string | null;
  github_pr_number: number | null;
  title: string | null;
  created_at: string;
}

interface ClaimedProjectRow {
  id: string;
  slug: string;
  name: string;
  assignee_started_at: string | null;
}

interface ProjectRefRow {
  id: string;
  slug: string;
  name: string;
}

interface PullRequestTaskRow {
  id: string;
  title: string;
}

type Candidate = RecentActivityItem & {
  /** Events sharing a key are about the same thing; only the newest survives. */
  subjectKey: string;
};

export async function listRecentActivityForUser(
  supabase: SupabaseClient,
  userId: string,
  limit: number,
): Promise<RecentActivityItem[]> {
  const [tasksResult, pullRequestsResult, projectClaimsResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, status, project_id, assignee_started_at, completed_at")
      .eq("assignee_id", userId)
      .is("deleted_at", null)
      .order("assignee_started_at", { ascending: false, nullsFirst: false })
      .limit(SCAN_LIMIT),
    supabase
      .from("pull_requests")
      .select("id, project_id, task_id, github_pr_url, github_pr_number, title, created_at")
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .limit(SCAN_LIMIT),
    supabase
      .from("projects")
      .select("id, slug, name, assignee_started_at")
      .eq("assignee_id", userId)
      .is("deleted_at", null)
      .order("assignee_started_at", { ascending: false, nullsFirst: false })
      .limit(SCAN_LIMIT),
  ]);

  if (tasksResult.error) {
    throw new Error(`Failed to load your task activity: ${tasksResult.error.message}`);
  }
  if (pullRequestsResult.error) {
    throw new Error(`Failed to load your pull request activity: ${pullRequestsResult.error.message}`);
  }
  if (projectClaimsResult.error) {
    throw new Error(`Failed to load your project activity: ${projectClaimsResult.error.message}`);
  }

  const taskRows = (tasksResult.data ?? []) as unknown as TaskRow[];
  const pullRequestRows = (pullRequestsResult.data ?? []) as unknown as PullRequestRow[];
  const claimedProjectRows = (projectClaimsResult.data ?? []) as unknown as ClaimedProjectRow[];

  // Names/slugs for the projects behind tasks and pull requests — one batched
  // query, not one per row. A project that has been soft-deleted is absent
  // from the map, and events pointing at it are dropped below: a link to a
  // project that no longer exists would only lead to a 404.
  const projectIds = Array.from(
    new Set([...taskRows.map((row) => row.project_id), ...pullRequestRows.map((row) => row.project_id)]),
  );
  const projectsById = new Map<string, ProjectRefRow>();
  if (projectIds.length > 0) {
    const { data, error } = await supabase
      .from("projects")
      .select("id, slug, name")
      .in("id", projectIds)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to load activity projects: ${error.message}`);
    for (const row of (data ?? []) as unknown as ProjectRefRow[]) {
      projectsById.set(row.id, row);
    }
  }

  // A pull request's task usually is one the user claimed (already in
  // `taskRows`), but resolve any that aren't so its title is still available.
  const knownTaskTitles = new Map<string, string>(taskRows.map((row) => [row.id, row.title]));
  const missingTaskIds = Array.from(
    new Set(
      pullRequestRows
        .map((row) => row.task_id)
        .filter((id): id is string => id !== null && !knownTaskTitles.has(id)),
    ),
  );
  if (missingTaskIds.length > 0) {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, title")
      .in("id", missingTaskIds)
      .is("deleted_at", null);
    if (error) throw new Error(`Failed to load activity tasks: ${error.message}`);
    for (const row of (data ?? []) as unknown as PullRequestTaskRow[]) {
      knownTaskTitles.set(row.id, row.title);
    }
  }

  const candidates: Candidate[] = [];

  for (const row of taskRows) {
    const project = projectsById.get(row.project_id);
    if (!project) continue;

    const base = {
      title: row.title,
      projectSlug: project.slug,
      projectName: project.name,
      taskId: row.id,
      pullRequest: null,
      subjectKey: `task:${row.id}`,
    };

    if (row.assignee_started_at) {
      candidates.push({
        ...base,
        id: `TASK_STARTED:${row.id}`,
        type: "TASK_STARTED",
        occurredAt: row.assignee_started_at,
      });
    }
    if (row.status === "DONE" && row.completed_at) {
      candidates.push({
        ...base,
        id: `TASK_COMPLETED:${row.id}`,
        type: "TASK_COMPLETED",
        occurredAt: row.completed_at,
      });
    }
  }

  for (const row of pullRequestRows) {
    const project = projectsById.get(row.project_id);
    if (!project) continue;

    const taskTitle = row.task_id ? knownTaskTitles.get(row.task_id) : undefined;
    // A pull request whose task has since been deleted is dropped rather than
    // shown under a task title that no longer exists.
    if (row.task_id && taskTitle === undefined) continue;

    candidates.push({
      id: `PULL_REQUEST_SUBMITTED:${row.id}`,
      type: "PULL_REQUEST_SUBMITTED",
      title: taskTitle ?? project.name,
      projectSlug: project.slug,
      projectName: project.name,
      taskId: row.task_id,
      occurredAt: row.created_at,
      pullRequest: { number: row.github_pr_number, url: row.github_pr_url },
      subjectKey: row.task_id ? `task:${row.task_id}` : `project:${row.project_id}`,
    });
  }

  for (const row of claimedProjectRows) {
    if (!row.assignee_started_at) continue;
    candidates.push({
      id: `PROJECT_STARTED:${row.id}`,
      type: "PROJECT_STARTED",
      title: row.name,
      projectSlug: row.slug,
      projectName: row.name,
      taskId: null,
      occurredAt: row.assignee_started_at,
      pullRequest: null,
      subjectKey: `project:${row.id}`,
    });
  }

  candidates.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));

  const seenSubjects = new Set<string>();
  const items: RecentActivityItem[] = [];
  for (const { subjectKey, ...item } of candidates) {
    if (seenSubjects.has(subjectKey)) continue;
    seenSubjects.add(subjectKey);
    items.push(item);
    if (items.length >= limit) break;
  }
  return items;
}