/**
 * Frontend shapes for the contributor-facing **View Issue** page
 * (`/issues/:projectSlug/:issueNumber`) and its Contribute sibling
 * (`/issues/:projectSlug/:issueNumber/contribute`).
 *
 * Mirrors the payload of `GET /issues/:projectSlug/:issueNumber`
 * (devtunnel-backend `src/routes/issueDetail.ts`) field for field.
 *
 * `Issue` (`./types.ts`) is the trimmed *list* row — no body, no comment
 * count — because a list of hundreds of bodies would be enormous. This is
 * the single-issue view: the same fields plus the issue's text, and the one
 * DevTunnel-side fact GitHub can't tell us, whether a DevTunnel task has
 * already been made from it.
 *
 * The author, project and state types are reused rather than redeclared
 * (same GitHub object, same project reference), so a change to one shape
 * can't leave this one behind.
 */
import type { OnboardingGithubIdentity } from "@/lib/admin/project-onboarding/types";
import type { TaskStatus } from "@/lib/tasks/types";
import type { IssueProjectRef, IssueState } from "./types";

/** A live DevTunnel task created from this issue — what the page links to instead of offering to start the issue itself. */
export interface IssueDetailTaskRef {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface IssueDetail {
  number: number;
  title: string;
  /** The issue on GitHub. */
  url: string;
  /** An issue can be closed on GitHub before a contributor gets to it, so this is always shown. */
  state: IssueState;
  /** The issue text exactly as filed on GitHub (markdown), or `null` when it has none. */
  body: string | null;
  labels: string[];
  commentCount: number;
  /** The GitHub user who opened the issue. */
  author: OnboardingGithubIdentity;
  createdAt: string;
  updatedAt: string;
  project: IssueProjectRef;
  /** `null` when no live DevTunnel task covers this issue. */
  task: IssueDetailTaskRef | null;
}
