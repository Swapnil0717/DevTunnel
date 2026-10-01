import type { Task } from "@/lib/tasks/types";

/** Same rule the backend and the Issues table apply before a repository name goes anywhere. */
const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export interface TaskExplainTarget {
  /** `owner/repo` */
  repo: string;
  issueNumber: number;
}

/**
 * What to hand to the AI "Explain" endpoint (`POST /ai/issue-explanation`,
 * source `"devtunnel"`) for a DevTunnel task — or `null` when there is
 * nothing it could explain, so the page simply doesn't show the button
 * rather than offering one that can only fail:
 *
 *  - the task has no linked GitHub issue (it only has DevTunnel's own brief);
 *  - the issue is closed, or the task is already DONE (nothing left to start);
 *  - the repository name isn't a plain `owner/repo` (the backend would reject it).
 *
 * A task's explanation is the explanation of its GitHub issue — the endpoint
 * stores one per (repo, issue), so the same text is reused by the `/issues`
 * page, the Tasks list and the task pages, and nobody pays for it twice.
 */
export function getTaskExplainTarget(
  task: Pick<Task, "status" | "githubIssue"> & { project: Pick<Task["project"], "repositoryFullName"> },
): TaskExplainTarget | null {
  if (!task.githubIssue) return null;
  if (task.status === "DONE" || task.githubIssue.state === "CLOSED") return null;
  if (!REPO_NAME_PATTERN.test(task.project.repositoryFullName)) return null;
  return { repo: task.project.repositoryFullName, issueNumber: task.githubIssue.number };
}
