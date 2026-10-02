import type { IssueDetail } from "@/lib/issues/detail-types";

/** Same rule the backend, the Issues table and `getTaskExplainTarget` apply before a repository name goes anywhere. */
const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export interface IssueExplainTarget {
  /** `owner/repo` */
  repo: string;
  issueNumber: number;
}

/**
 * What to hand to the AI "Explain" endpoint (`POST /ai/issue-explanation`,
 * source `"devtunnel"`) for the issue on the View Issue / Contribute pages —
 * or `null` when there is nothing it could explain, so the page doesn't show
 * a button that can only fail:
 *
 *  - the issue is closed (the backend refuses with `issue_closed`);
 *  - the repository name isn't a plain `owner/repo` (the backend would
 *    reject it).
 *
 * Counterpart of `getTaskExplainTarget` (`./task-explain.ts`). Both name the
 * same (repo, issue) pair, and the backend stores one explanation per pair —
 * so the text is shared with the Explain toggle on `/issues` and with the
 * task pages, and nobody pays for a second model call.
 */
export function getIssueExplainTarget(
  issue: Pick<IssueDetail, "state" | "number"> & { project: Pick<IssueDetail["project"], "repositoryFullName"> },
): IssueExplainTarget | null {
  if (issue.state !== "OPEN") return null;
  if (!REPO_NAME_PATTERN.test(issue.project.repositoryFullName)) return null;
  return { repo: issue.project.repositoryFullName, issueNumber: issue.number };
}
