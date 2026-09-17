import { z } from "zod";
import { logger } from "./logger";

/**
 * Opens (or finds an already-open) GitHub pull request on behalf of the
 * signed-in contributor — backs `dev submit` (src/routes/tasks.ts
 * `POST /tasks/:id/submit`). Sibling to src/lib/githubFork.ts: same
 * posture (`accessToken` required — opening a PR "as" the contributor has
 * no anonymous form), same reasoning for its own file rather than folding
 * into githubRepo.ts (that file is read-only repository *metadata*; this
 * is a write against the upstream repository using the contributor's own
 * GitHub authorization).
 */

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT = "devtunnel-backend";

export class GitHubPullRequestError extends Error {
  reason: "not_found" | "unauthorized" | "rate_limited" | "validation" | "github_unavailable";
  constructor(reason: GitHubPullRequestError["reason"], message: string) {
    super(message);
    this.name = "GitHubPullRequestError";
    this.reason = reason;
  }
}

export interface GitHubPullRequest {
  number: number;
  htmlUrl: string;
  state: "open" | "closed";
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

const pullRequestSchema = z.object({
  number: z.number(),
  html_url: z.string().url(),
  state: z.enum(["open", "closed"]),
});

function toPr(data: z.infer<typeof pullRequestSchema>): GitHubPullRequest {
  return { number: data.number, htmlUrl: data.html_url, state: data.state };
}

/**
 * The upstream repository's default branch (`main`, `master`, etc.) —
 * `dev submit` opens every PR against this, never a branch the CLI or the
 * contributor guessed. Not cached anywhere: this is one cheap GitHub call
 * per submit, and the default branch is exactly the kind of thing that
 * silently changes over a project's lifetime.
 */
export async function fetchDefaultBranch(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<string> {
  const res = await fetchWithTimeout(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: authHeaders(accessToken),
  });
  await assertOk(res, "repository lookup");

  const parsed = z.object({ default_branch: z.string().min(1) }).safeParse(await res.json());
  if (!parsed.success) {
    throw new GitHubPullRequestError(
      "github_unavailable",
      "Unexpected GitHub repository response shape",
    );
  }
  return parsed.data.default_branch;
}

/**
 * Checks whether an open PR already exists from `headOwner:headBranch`
 * into `baseOwner/baseRepo` — GitHub's own create-PR endpoint (below)
 * rejects a second PR for the same head/base with a 422 rather than
 * returning the existing one, so this is what lets a re-run `dev submit`
 * (new commits, same branch) update the same PR instead of erroring.
 * Best-effort: a non-2xx response is treated as "couldn't confirm, assume
 * no existing PR" rather than thrown, since `createPullRequest` below is
 * the real source of truth either way.
 */
export async function findOpenPullRequest(
  accessToken: string,
  baseOwner: string,
  baseRepo: string,
  headOwner: string,
  headBranch: string,
): Promise<GitHubPullRequest | null> {
  const url = new URL(`${GITHUB_API_BASE}/repos/${baseOwner}/${baseRepo}/pulls`);
  url.searchParams.set("state", "open");
  url.searchParams.set("head", `${headOwner}:${headBranch}`);

  const res = await fetchWithTimeout(url.toString(), { headers: authHeaders(accessToken) });
  if (!res.ok) return null;

  const parsed = z.array(pullRequestSchema).safeParse(await res.json());
  if (!parsed.success || parsed.data.length === 0) return null;

  return toPr(parsed.data[0]!);
}

/**
 * Opens a PR from the contributor's fork branch into the upstream
 * repository's default branch. `head` is qualified with the fork's owner
 * (`owner:branch`) whenever the fork isn't the same repo as the base —
 * always true for `dev submit`, since the contributor works from their
 * own fork, never a branch pushed directly to the upstream project.
 *
 * GitHub returns 422 when a PR already exists for this head/base — rather
 * than surfacing that as a hard failure to a contributor who pushed a new
 * commit and re-ran `dev submit`, this falls back to `findOpenPullRequest`
 * and returns the existing PR (`created: false`) so the route can update
 * DevTunnel's own record against it instead.
 */
export async function createPullRequest(
  accessToken: string,
  args: {
    baseOwner: string;
    baseRepo: string;
    baseBranch: string;
    headOwner: string;
    headBranch: string;
    title: string;
    body: string;
  },
): Promise<{ pr: GitHubPullRequest; created: boolean }> {
  const head =
    args.headOwner.toLowerCase() === args.baseOwner.toLowerCase()
      ? args.headBranch
      : `${args.headOwner}:${args.headBranch}`;

  const res = await fetchWithTimeout(`${GITHUB_API_BASE}/repos/${args.baseOwner}/${args.baseRepo}/pulls`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      title: args.title,
      head,
      base: args.baseBranch,
      body: args.body,
      maintainer_can_modify: true,
    }),
  });

  if (res.status === 422) {
    const existing = await findOpenPullRequest(
      accessToken,
      args.baseOwner,
      args.baseRepo,
      args.headOwner,
      args.headBranch,
    );
    if (existing) return { pr: existing, created: false };

    const bodyText = await res.text().catch(() => "");
    logger.warn("github_pr_validation_failed", { body: bodyText.slice(0, 300) });
    throw new GitHubPullRequestError(
      "validation",
      "GitHub rejected this pull request — make sure your branch has commits ahead of the base branch",
    );
  }

  await assertOk(res, "create pull request");

  const parsed = pullRequestSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new GitHubPullRequestError(
      "github_unavailable",
      "Unexpected GitHub pull request response shape",
    );
  }

  return { pr: toPr(parsed.data), created: true };
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw new GitHubPullRequestError(
      "github_unavailable",
      `GitHub request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function assertOk(res: Response, context: string): Promise<void> {
  if (res.ok) return;
  const bodyText = await res.text().catch(() => "");
  const bodySnippet = bodyText.slice(0, 300);

  if (res.status === 404) {
    logger.warn("github_pr_not_found", { context, body: bodySnippet });
    throw new GitHubPullRequestError("not_found", "Repository not found, or not accessible");
  }
  if (res.status === 401 || res.status === 403) {
    logger.error("github_pr_unauthorized", { context, status: res.status, body: bodySnippet });
    throw new GitHubPullRequestError(
      "unauthorized",
      "Your GitHub connection is no longer valid — reconnect GitHub and try again",
    );
  }
  if (res.status === 429) {
    logger.warn("github_pr_rate_limited", { context, body: bodySnippet });
    throw new GitHubPullRequestError("rate_limited", "GitHub rate limit reached — try again shortly");
  }
  logger.error("github_pr_unexpected_status", { context, status: res.status, body: bodySnippet });
  throw new GitHubPullRequestError("github_unavailable", `GitHub ${context} returned ${res.status}`);
}