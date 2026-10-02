import { logger } from "./logger";

/**
 * Builds the pull request body `POST /github/submit` (src/routes/githubWork.ts)
 * opens on someone else's repository.
 *
 * `buildPullRequestBody` in routes/tasks.ts fills in DevTunnel's OWN template
 * (CLA, CONTRIBUTING.md, ...), which is wrong for a project that isn't
 * DevTunnel. Here the target repository's own template wins:
 *
 *   1. Look for the repo's pull request template (the places GitHub itself
 *      looks). If one exists, the PR body is a short generated summary
 *      followed by that template, verbatim — its checklist is left unticked
 *      for the contributor, because the CLI cannot know whether e.g. "I have
 *      signed the CLA" is true.
 *   2. If the repo has none, a plain generic body: summary, linked issue,
 *      changes, how it was tested. No DevTunnel-specific checklist.
 */

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 8000;
const USER_AGENT = "devtunnel-backend";

/** GitHub's PR body limit is 65,536 characters; leave plenty of room for the summary. */
const MAX_TEMPLATE_CHARS = 30_000;

/** Where GitHub looks for a single default pull request template, in its own order of precedence. */
const TEMPLATE_PATHS = [
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/pull_request_template.md",
  "PULL_REQUEST_TEMPLATE.md",
  "pull_request_template.md",
  "docs/PULL_REQUEST_TEMPLATE.md",
  "docs/pull_request_template.md",
] as const;

export type CommitType = "feat" | "fix" | "docs" | "chore";

/**
 * Returns the repository's default pull request template, or `null` when it
 * has none (or GitHub can't be reached — a missing template must never block
 * opening the PR).
 */
export async function fetchPullRequestTemplate(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<string | null> {
  for (const path of TEMPLATE_PATHS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`, {
        headers: {
          "User-Agent": USER_AGENT,
          // The raw media type returns the file body itself, no base64 JSON wrapper.
          Accept: "application/vnd.github.raw+json",
          "X-GitHub-Api-Version": "2022-11-28",
          Authorization: `Bearer ${accessToken}`,
        },
        signal: controller.signal,
      });
      if (res.status === 404) continue;
      if (!res.ok) {
        logger.warn("pr_template_lookup_failed", { repo: `${owner}/${repo}`, path, status: res.status });
        return null;
      }
      const text = (await res.text()).trim();
      if (!text) continue;
      return text.length > MAX_TEMPLATE_CHARS ? `${text.slice(0, MAX_TEMPLATE_CHARS)}\n…` : text;
    } catch (err) {
      logger.warn("pr_template_lookup_error", {
        repo: `${owner}/${repo}`,
        path,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}

const TYPE_LABEL: Record<CommitType, string> = {
  feat: "New feature",
  fix: "Bug fix",
  docs: "Documentation update",
  chore: "Refactor / chore",
};

/** The part of the body that is the same with or without a repository template. */
function buildSummary(args: {
  type: CommitType;
  commits: string[];
  testedNote: string | null;
  issueNumber: number | null;
}): string {
  const { type, commits, testedNote, issueNumber } = args;
  return [
    "## Summary",
    "",
    `**Type:** ${TYPE_LABEL[type]}`,
    issueNumber ? `\n**Related issue:** Closes #${issueNumber}` : "",
    "",
    "### Changes",
    "",
    ...commits.map((subject) => `- ${subject}`),
    "",
    "### How this was tested",
    "",
    testedNote ?? "_Not specified._",
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n");
}

export function buildExternalPullRequestBody(args: {
  type: CommitType;
  commits: string[];
  testedNote: string | null;
  issueNumber: number | null;
  /** From `fetchPullRequestTemplate`, or null when the repo has none. */
  template: string | null;
}): string {
  const summary = buildSummary(args);
  if (!args.template) return summary;
  return `${summary}\n\n---\n\n${args.template}`;
}
