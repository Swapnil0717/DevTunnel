import { z } from "zod";
import type { GithubIssueSummary, OnboardingGithubIdentity } from "../types";

/**
 * GitHub REST client for Admin Project Onboarding, Step 1 ("Import GitHub
 * Repository" — admin_workflow.txt section 6). Separate from
 * src/lib/github.ts (which handles the OAuth *sign-in* flow) because this
 * module fetches *repository* data — metadata, README, contributors,
 * languages — rather than a signed-in user's own identity.
 *
 * Requests are made with the calling admin's own stored GitHub user
 * access token when available (src/db/githubTokens.ts
 * `getValidGithubAccessToken` — the same per-user token already used by
 * src/routes/contributions.ts), falling back to an unauthenticated
 * request for public repositories. This backend has no separate
 * server-wide GitHub credential to invent (Backend_Development_Rules.txt
 * rule 6/98) — reusing the admin's own already-verified GitHub
 * authorization is both correct (it reflects exactly what that admin can
 * actually see on GitHub) and avoids introducing a new secret.
 */

const GITHUB_API_BASE = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 8000;
const USER_AGENT = "devtunnel-backend";

export class GitHubRepoError extends Error {
  /** Safe-to-show-the-admin reason code (never a raw GitHub/HTTP detail). */
  reason:
    | "invalid_url"
    | "not_found"
    | "rate_limited"
    | "github_unavailable";
  constructor(reason: GitHubRepoError["reason"], message: string) {
    super(message);
    this.name = "GitHubRepoError";
    this.reason = reason;
  }
}

/** rule 53: never let an external request hang indefinitely. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    throw new GitHubRepoError(
      "github_unavailable",
      `GitHub request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function authHeaders(accessToken: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return headers;
}

/** Throws a mapped, safe-to-surface `GitHubRepoError` for a non-2xx GitHub response. */
function assertOk(res: Response, context: string): void {
  if (res.ok) return;
  if (res.status === 404) {
    throw new GitHubRepoError(
      "not_found",
      "Repository not found, or not accessible with the connected GitHub account",
    );
  }
  if (res.status === 403 || res.status === 429) {
    throw new GitHubRepoError("rate_limited", "GitHub rate limit reached — try again shortly");
  }
  throw new GitHubRepoError("github_unavailable", `GitHub ${context} returned ${res.status}`);
}

/**
 * Parses a GitHub repository reference from any of the forms an admin
 * might paste: full HTTPS URL (with or without `.git`/trailing
 * path/slash), SSH URL, or bare `owner/repo` shorthand. Returns `null`
 * for anything that doesn't resolve to a syntactically valid owner+repo
 * pair — the caller treats that as a 400 (rule 14: validate every input).
 */
export function parseGithubRepoUrl(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let ownerRepo: string | null = null;

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  if (sshMatch) {
    ownerRepo = `${sshMatch[1]}/${sshMatch[2]}`;
  } else {
    try {
      const url = new URL(
        /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
      );
      if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length < 2) return null;
      ownerRepo = `${segments[0]}/${segments[1]!.replace(/\.git$/i, "")}`;
    } catch {
      // Not a URL at all — fall through to the bare "owner/repo" case.
      if (/^[^/\s]+\/[^/\s]+$/.test(trimmed)) {
        ownerRepo = trimmed.replace(/\.git$/i, "");
      }
    }
  }

  if (!ownerRepo) return null;
  const [owner, repo] = ownerRepo.split("/");
  if (!owner || !repo) return null;

  // GitHub login/repo character rules — alphanumeric plus hyphen/period/
  // underscore, reasonable length bounds. Rejects anything that isn't a
  // plausible identifier before it ever reaches the GitHub API.
  const ownerPattern = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/;
  const repoPattern = /^[a-zA-Z0-9._-]{1,100}$/;
  if (!ownerPattern.test(owner) || !repoPattern.test(repo)) return null;

  return { owner, repo };
}

const githubIdentitySchema = z.object({
  login: z.string().min(1),
  name: z.string().nullable().optional(),
  avatar_url: z.string().url().nullable().optional(),
  html_url: z.string().url(),
});

function toIdentity(raw: z.infer<typeof githubIdentitySchema>): OnboardingGithubIdentity {
  return {
    username: raw.login,
    name: raw.name ?? null,
    avatarUrl: raw.avatar_url ?? null,
    profileUrl: raw.html_url,
  };
}

const repoSchema = z.object({
  name: z.string().min(1),
  full_name: z.string().min(1),
  html_url: z.string().url(),
  description: z.string().nullable().optional(),
  default_branch: z.string().min(1),
  language: z.string().nullable().optional(),
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  open_issues_count: z.number().int().nonnegative(),
  private: z.boolean(),
  owner: githubIdentitySchema,
});

export interface GitHubRepoMetadata {
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  defaultBranch: string;
  primaryLanguage: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  isPrivate: boolean;
  author: OnboardingGithubIdentity;
}

/**
 * "Fetch repository" / "Fetch repository metadata" / "Fetch author/owner"
 * / "Fetch default branch" / "Fetch repository language" (Step 1
 * algorithm). A successful response here — for a public repo, or a
 * private one the token can see — is treated as proof of access; there is
 * no separate GitHub App installation model in this codebase to check
 * against (rule 52: validate the response shape before trusting it).
 */
export async function fetchRepositoryMetadata(
  accessToken: string | null,
  owner: string,
  repo: string,
): Promise<GitHubRepoMetadata> {
  const res = await fetchWithTimeout(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: authHeaders(accessToken),
  });
  assertOk(res, "repository lookup");

  const parsed = repoSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new GitHubRepoError("github_unavailable", "Unexpected GitHub repository response shape");
  }
  const data = parsed.data;
  return {
    name: data.name,
    fullName: data.full_name,
    htmlUrl: data.html_url,
    description: data.description ?? null,
    defaultBranch: data.default_branch,
    primaryLanguage: data.language ?? null,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    isPrivate: data.private,
    author: toIdentity(data.owner),
  };
}

const contributorsSchema = z.array(githubIdentitySchema);

/** "Fetch contributors" (Step 1 algorithm). Capped to keep the draft/response bounded (rule 67). */
export async function fetchRepositoryContributors(
  accessToken: string | null,
  owner: string,
  repo: string,
  limit = 25,
): Promise<OnboardingGithubIdentity[]> {
  const res = await fetchWithTimeout(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/contributors?per_page=${limit}&anon=false`,
    { headers: authHeaders(accessToken) },
  );

  // A brand-new/empty repository (or one whose contributor stats
  // haven't been computed yet) can 204/403-with-no-body here — treat as
  // "no contributors yet" rather than failing the whole import.
  if (res.status === 204) return [];
  if (!res.ok) {
    if (res.status === 404) return [];
    assertOk(res, "contributors lookup");
  }

  const parsed = contributorsSchema.safeParse(await res.json());
  if (!parsed.success) return [];
  return parsed.data.map(toIdentity);
}

/**
 * "Fetch README" (Step 1 algorithm). Uses the raw media type so the
 * response body is the README's actual text content, not a base64-wrapped
 * JSON envelope. Returns `null` (not an error) when the repository simply
 * has no README — a missing README is a legitimate, common state, not a
 * failure to surface to the admin as red text.
 */
export async function fetchRepositoryReadme(
  accessToken: string | null,
  owner: string,
  repo: string,
): Promise<string | null> {
  const res = await fetchWithTimeout(`${GITHUB_API_BASE}/repos/${owner}/${repo}/readme`, {
    headers: { ...authHeaders(accessToken), Accept: "application/vnd.github.raw" },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    // A README fetch failure (rate limit, transient GitHub error) shouldn't
    // block the entire repository import — surface no README rather than
    // failing Step 1 outright, matching rule 51 (external APIs can fail;
    // degrade gracefully rather than cascading the failure).
    return null;
  }
  const text = await res.text();
  // GitHub caps this response around 1MB; guard defensively against an
  // unexpectedly huge body inflating the draft/project row (rule 67).
  return text.length > 200_000 ? text.slice(0, 200_000) : text;
}

/**
 * Fetches a single repository file's decoded text content (e.g.
 * `package.json`), used by src/lib/techStack.ts's manifest-based
 * detection (Step 3 algorithm: "Inspect dependency files"). Returns
 * `null` when the file doesn't exist — most manifest lookups are
 * speculative ("does this repo have a package.json?").
 */
export async function fetchRepositoryFile(
  accessToken: string | null,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<string | null> {
  const url = new URL(`${GITHUB_API_BASE}/repos/${owner}/${repo}/contents/${path}`);
  if (ref) url.searchParams.set("ref", ref);

  const res = await fetchWithTimeout(url.toString(), { headers: authHeaders(accessToken) });
  if (res.status === 404) return null;
  if (!res.ok) return null;

  const fileSchema = z.object({ content: z.string(), encoding: z.string() });
  const parsed = fileSchema.safeParse(await res.json());
  if (!parsed.success || parsed.data.encoding !== "base64") return null;

  try {
    const binary = atob(parsed.data.content.replace(/\n/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * GitHub's `GET /repos/{owner}/{repo}/issues` (and the single-issue
 * variant) return *both* issues and pull requests — a PR is just an issue
 * with a `pull_request` key attached. Task Onboarding Step 2 ("Select
 * Existing Issue") only ever wants genuine issues, so this schema keeps
 * `pull_request` optional purely so it can be checked and filtered on,
 * never so it flows through to `GithubIssueSummary`.
 */
const githubIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  state: z.enum(["open", "closed"]),
  html_url: z.string().url(),
  body: z.string().nullable().optional(),
  comments: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
  user: githubIdentitySchema.nullable(),
  labels: z.array(
    z.union([z.string(), z.object({ name: z.string().optional() })]),
  ),
  pull_request: z.unknown().optional(),
});

function toIssueLabels(raw: z.infer<typeof githubIssueSchema>["labels"]): string[] {
  return raw
    .map((label) => (typeof label === "string" ? label : label.name ?? null))
    .filter((label): label is string => Boolean(label));
}

/**
 * Maps a raw GitHub issue to the frontend-facing `GithubIssueSummary`
 * shape (src/types.ts). Falls back to a placeholder identity for the rare
 * case GitHub reports a `null` author (e.g. a deleted GitHub account) —
 * `GithubIssueSummary.author` is non-optional, so this never fabricates a
 * *username* GitHub didn't actually report, only fills the shape rule 73
 * requires.
 */
function toIssueSummary(raw: z.infer<typeof githubIssueSchema>): GithubIssueSummary {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state === "open" ? "OPEN" : "CLOSED",
    url: raw.html_url,
    labels: toIssueLabels(raw.labels),
    author: raw.user
      ? toIdentity(raw.user)
      : { username: "ghost", name: null, avatarUrl: null, profileUrl: raw.html_url },
    body: raw.body ?? null,
    commentCount: raw.comments,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

/**
 * "Fetch Issues" (Task Onboarding Step 2 algorithm — admin_workflow.txt
 * section 10). Fetches open issues only ("Remove irrelevant/unsupported
 * issues" — a closed issue isn't selectable work) and filters out pull
 * requests, which GitHub's issues endpoint otherwise mixes in. Capped the
 * same way `fetchRepositoryContributors` is (rule 67: bound response
 * size) — Admin picks from a first page of the repository's most
 * recently updated open issues rather than the entire backlog.
 */
export async function fetchRepositoryIssues(
  accessToken: string | null,
  owner: string,
  repo: string,
  limit = 50,
): Promise<GithubIssueSummary[]> {
  const res = await fetchWithTimeout(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues?state=open&per_page=${limit}&sort=updated&direction=desc`,
    { headers: authHeaders(accessToken) },
  );
  assertOk(res, "issues lookup");

  const parsed = z.array(githubIssueSchema).safeParse(await res.json());
  if (!parsed.success) {
    throw new GitHubRepoError("github_unavailable", "Unexpected GitHub issues response shape");
  }

  return parsed.data.filter((issue) => !issue.pull_request).map(toIssueSummary);
}

/**
 * "Re-fetch [the] issue" a Task Onboarding admin selected, so the backend
 * never trusts an issue's title/body/labels purely because they were
 * offered in an earlier `fetchRepositoryIssues` list response
 * (Backend_Development_Rules.txt rule 15). Returns `null` when the issue
 * doesn't exist, or turns out to actually be a pull request — both cases
 * the caller (src/db/taskOnboarding.ts) treats as "not selectable",
 * exactly like an outright 404.
 */
export async function fetchRepositoryIssue(
  accessToken: string | null,
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<GithubIssueSummary | null> {
  const res = await fetchWithTimeout(`${GITHUB_API_BASE}/repos/${owner}/${repo}/issues/${issueNumber}`, {
    headers: authHeaders(accessToken),
  });
  if (res.status === 404) return null;
  assertOk(res, "issue lookup");

  const parsed = githubIssueSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new GitHubRepoError("github_unavailable", "Unexpected GitHub issue response shape");
  }
  if (parsed.data.pull_request) return null;

  return toIssueSummary(parsed.data);
}

const languagesSchema = z.record(z.string(), z.number());

/** "Fetch repository language" byte breakdown (Step 1 algorithm / Step 3 tech-stack detection input). */
export async function fetchRepositoryLanguages(
  accessToken: string | null,
  owner: string,
  repo: string,
): Promise<Record<string, number>> {
  const res = await fetchWithTimeout(`${GITHUB_API_BASE}/repos/${owner}/${repo}/languages`, {
    headers: authHeaders(accessToken),
  });
  if (!res.ok) return {};
  const parsed = languagesSchema.safeParse(await res.json());
  return parsed.success ? parsed.data : {};
}