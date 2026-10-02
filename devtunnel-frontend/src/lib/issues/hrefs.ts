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

/**
 * The slug an issue of a repository that is NOT a DevTunnel project is
 * addressed by: GitHub's `owner/repo`, lower-cased, with `--` for the slash —
 * the same encoding `/github-projects/:slug` uses. `GET /issues/:slug/:number`
 * resolves it, so a GitHub-catalog repo's or a tool's issue opens the same
 * View Issue page as a DevTunnel project's.
 */
export function repoIssueSlug(repositoryFullName: string): string {
  return repositoryFullName.toLowerCase().replace("/", "--");
}

/** Where "View project" on an issue page goes: the DevTunnel project, or the GitHub-catalog repo page. */
export function issueProjectHref(projectSlug: string, source: "devtunnel" | "github" | undefined): string {
  return source === "github" ? `/github-projects/${projectSlug}` : `/projects/${projectSlug}`;
}
