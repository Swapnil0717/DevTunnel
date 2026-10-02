/**
 * The two DevTunnel-side destinations an issue has, kept in one place so the
 * All Issues cards, a project's Issues tab and the two issue pages can never
 * disagree about the URL.
 *
 * An issue is identified by its project's slug plus its GitHub issue number —
 * the same pair `GET /issues/:projectSlug/:issueNumber` takes. (The number
 * alone isn't unique: every repository has its own #1.)
 */
export function issueHref(projectSlug: string, issueNumber: number): string {
  return `/issues/${encodeURIComponent(projectSlug)}/${issueNumber}`;
}

/** The issue's Contribute page — where "Contribute to this issue" leads. */
export function issueContributeHref(projectSlug: string, issueNumber: number): string {
  return `${issueHref(projectSlug, issueNumber)}/contribute`;
}
