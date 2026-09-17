import { z } from "zod";
import { logger } from "./logger";

/**
 * Forks a repository on GitHub, on behalf of the signed-in contributor —
 * backs `dev start` (src/routes/tasks.ts `POST /tasks/:id/start`). Sibling
 * to `starRepositoryForUser` in src/lib/githubRepo.ts: same posture
 * (`accessToken` required, not optional — forking "for the authenticated
 * user" has no meaningful anonymous form), same reasoning for living in
 * its own file rather than widening githubRepo.ts (that file is read-only
 * repository *metadata*; this is a write against the contributor's own
 * GitHub account).
 */

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT = "devtunnel-backend";

export class GitHubForkError extends Error {
  reason: "not_found" | "unauthorized" | "rate_limited" | "github_unavailable";
  constructor(reason: GitHubForkError["reason"], message: string) {
    super(message);
    this.name = "GitHubForkError";
    this.reason = reason;
  }
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${accessToken}`,
  };
}

const forkSchema = z.object({
  full_name: z.string().min(1),
  html_url: z.string().url(),
  clone_url: z.string().url(),
  ssh_url: z.string().min(1),
  default_branch: z.string().min(1),
});

export interface GitHubFork {
  fullName: string;
  htmlUrl: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
}

/**
 * Checks whether `accessToken`'s owner already has a fork of
 * `owner/repo`, and returns it if so — GitHub's own fork-create endpoint
 * (below) is itself idempotent (re-POSTing returns the existing fork
 * rather than erroring), but this lets `dev start` skip the network round
 * trip entirely on the common "already forked, running `dev start` again"
 * path, and lets `startTask` (src/db/tasks.ts) decide whether to reuse an
 * existing DB-recorded fork without calling GitHub twice.
 */
export async function findExistingFork(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<GitHubFork | null> {
  const identity = await fetchAuthenticatedLogin(accessToken);
  const res = await fetchWithTimeout(`${GITHUB_API_BASE}/repos/${identity}/${repo}`, {
    headers: authHeaders(accessToken),
  });
  if (res.status === 404) return null;
  if (!res.ok) return null; // Best-effort probe — a real fork attempt still runs below if this fails.

  const body = await res.json();
  const parsed = forkSchema.safeParse(body);
  if (!parsed.success) return null;

  // A repo at `identity/repo` that exists but isn't actually a fork of
  // `owner/repo` (e.g. the contributor happens to own an unrelated repo
  // with the same name) must not be mistaken for "already forked" — fall
  // through to a real fork attempt instead. `fork`/`parent` aren't part
  // of `forkSchema` (kept minimal for the create-fork response, which
  // never includes them), so they're read directly off the already-parsed
  // raw JSON body here.
  const raw = body as { fork?: boolean; parent?: { full_name?: string } };
  if (!raw?.fork || raw.parent?.full_name?.toLowerCase() !== `${owner}/${repo}`.toLowerCase()) {
    return null;
  }

  return toFork(parsed.data);
}

async function fetchAuthenticatedLogin(accessToken: string): Promise<string> {
  const res = await fetchWithTimeout(`${GITHUB_API_BASE}/user`, { headers: authHeaders(accessToken) });
  await assertOk(res, "authenticated user lookup");
  const parsed = z.object({ login: z.string().min(1) }).safeParse(await res.json());
  if (!parsed.success) {
    throw new GitHubForkError("github_unavailable", "Unexpected GitHub user response shape");
  }
  return parsed.data.login;
}

function toFork(data: z.infer<typeof forkSchema>): GitHubFork {
  return {
    fullName: data.full_name,
    htmlUrl: data.html_url,
    cloneUrl: data.clone_url,
    sshUrl: data.ssh_url,
    defaultBranch: data.default_branch,
  };
}

/**
 * Forks `owner/repo` into the signed-in contributor's own GitHub account,
 * using their own stored OAuth token (`getValidGithubAccessToken`,
 * db/githubTokens.ts — the same per-user token `starRepositoryForUser`
 * already uses). GitHub's fork endpoint returns `202 Accepted`
 * immediately — the fork is created asynchronously on GitHub's side, so
 * this polls briefly for the fork to actually become clone-able rather
 * than handing the CLI a `git clone` URL that 404s for the next few
 * seconds.
 */
export async function forkRepositoryForUser(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<GitHubFork> {
  const res = await fetchWithTimeout(`${GITHUB_API_BASE}/repos/${owner}/${repo}/forks`, {
    method: "POST",
    headers: { ...authHeaders(accessToken), "Content-Length": "0" },
  });
  await assertOk(res, "fork repository");

  const parsed = forkSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new GitHubForkError("github_unavailable", "Unexpected GitHub fork response shape");
  }
  const fork = toFork(parsed.data);

  // GitHub fork creation is asynchronous — poll a few times for the fork
  // to actually resolve before handing it back, so `dev start`'s `git
  // clone` doesn't race a fork that technically exists but isn't cloneable
  // yet. Not fatal if it never resolves within the budget: return the
  // fork anyway and let `git clone` itself retry/fail with a clear error
  // (this backend never blocks the whole request on GitHub's own eventual
  // consistency window).
  const [forkOwner] = fork.fullName.split("/");
  for (let attempt = 0; attempt < 5; attempt++) {
    const check = await fetchWithTimeout(`${GITHUB_API_BASE}/repos/${fork.fullName}`, {
      headers: authHeaders(accessToken),
    });
    if (check.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  void forkOwner;

  return fork;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw new GitHubForkError(
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
    logger.warn("github_fork_not_found", { context, body: bodySnippet });
    throw new GitHubForkError("not_found", "Repository not found, or not accessible");
  }
  if (res.status === 401 || res.status === 403) {
    logger.error("github_fork_unauthorized", { context, status: res.status, body: bodySnippet });
    throw new GitHubForkError(
      "unauthorized",
      "Your GitHub connection is no longer valid — reconnect GitHub and try again",
    );
  }
  if (res.status === 429) {
    logger.warn("github_fork_rate_limited", { context, body: bodySnippet });
    throw new GitHubForkError("rate_limited", "GitHub rate limit reached — try again shortly");
  }
  logger.error("github_fork_unexpected_status", { context, status: res.status, body: bodySnippet });
  throw new GitHubForkError("github_unavailable", `GitHub ${context} returned ${res.status}`);
}