import { z } from "zod";
import type { GithubIssueSummary, OnboardingGithubIdentity } from "../types";
import { logger } from "./logger";

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
// GitHub's own API is routinely slow to answer (observed 8-9s round trips
// on `issues` under normal load, not just under rate limiting), so a hard
// 8s cutoff was tripping on healthy-but-slow responses and surfacing as a
// hard failure with nothing to retry it. 15s gives real slow responses
// room to land; MAX_RETRIES below covers the requests that are genuinely
// timing out or hit a transient network blip.
const REQUEST_TIMEOUT_MS = 15000;
const MAX_RETRIES = 1;
const USER_AGENT = "devtunnel-backend";

export class GitHubRepoError extends Error {
  /** Safe-to-show-the-admin reason code (never a raw GitHub/HTTP detail). */
  reason:
    | "invalid_url"
    | "not_found"
    | "rate_limited"
    | "unauthorized"
    | "github_unavailable";
  /**
   * For `reason: "rate_limited"` only — GitHub's own reported quota-reset
   * time, read from the `X-RateLimit-Reset` response header (a Unix
   * epoch-seconds value) on the 403/429 that triggered this error. `null`
   * for every other reason, and also `null` on a rate-limited response
   * that (rarely) omits or malforms that header — callers must not assume
   * it's always present just because `reason === "rate_limited"`.
   */
  resetAt: Date | null;
  constructor(
    reason: GitHubRepoError["reason"],
    message: string,
    resetAt: Date | null = null,
  ) {
    super(message);
    this.name = "GitHubRepoError";
    this.reason = reason;
    this.resetAt = resetAt;
  }
}

/**
 * rule 53: never let an external request hang indefinitely.
 *
 * Retries once (network failure or our own abort/timeout only — never a
 * completed non-2xx HTTP response, which `assertOk` handles separately)
 * before giving up. This is what actually fixes the "GET .../issues 502
 * Bad Gateway" flakiness: a single slow-but-otherwise-healthy GitHub
 * response was being treated as a hard outage with no second chance.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  attempt = 0,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      return fetchWithTimeout(url, init, attempt + 1);
    }
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

/**
 * Throws a mapped, safe-to-surface `GitHubRepoError` for a non-2xx GitHub
 * response.
 *
 * Every failure branch here also logs the *real* GitHub status and (a
 * truncated, token-free) response body server-side via `logger.error` —
 * previously every non-404/403/429 failure collapsed into a generic
 * "github_unavailable" 502 with no way to tell, from the wrangler log
 * alone, whether GitHub was actually down or the stored access token was
 * simply bad (401 "Bad credentials" is the single most common cause of a
 * fast, consistent 502 here — an expired/revoked token that
 * `getValidGithubAccessToken` didn't catch because it still looked
 * unexpired by our own stored timestamp).
 */
async function assertOk(res: Response, context: string): Promise<void> {
  if (res.ok) return;

  // Read once, defensively — GitHub error bodies are small JSON, but this
  // must never throw if the body is empty/non-JSON.
  const bodyText = await res.text().catch(() => "");
  const bodySnippet = bodyText.slice(0, 300);

  if (res.status === 404) {
    logger.warn("github_api_not_found", { context, status: res.status, body: bodySnippet });
    throw new GitHubRepoError(
      "not_found",
      "Repository not found, or not accessible with the connected GitHub account",
    );
  }
  if (res.status === 401) {
    // A stored token that looks unexpired by our own timestamp but that
    // GitHub itself rejects — expired early, revoked by the user on
    // GitHub's side, or invalidated by an OAuth app secret rotation.
    logger.error("github_api_unauthorized", { context, status: res.status, body: bodySnippet });
    throw new GitHubRepoError(
      "unauthorized",
      "Your GitHub connection is no longer valid — reconnect GitHub and try again",
    );
  }
  if (res.status === 403 || res.status === 429) {
    // GitHub reports the quota-reset time as Unix epoch seconds in this
    // header on every rate-limited response (secondary as well as primary
    // limits) — parsed defensively since a missing/non-numeric header
    // must fall back to the old generic message, not throw here.
    const resetHeader = res.headers.get("X-RateLimit-Reset");
    const resetAt =
      resetHeader && /^\d+$/.test(resetHeader) ? new Date(Number(resetHeader) * 1000) : null;
    logger.warn("github_api_rate_limited", {
      context,
      status: res.status,
      body: bodySnippet,
      resetAt: resetAt?.toISOString() ?? null,
    });
    throw new GitHubRepoError(
      "rate_limited",
      resetAt
        ? `GitHub rate limit reached — resets at ${resetAt.toISOString()}`
        : "GitHub rate limit reached — try again shortly",
      resetAt,
    );
  }
  logger.error("github_api_unexpected_status", {
    context,
    status: res.status,
    body: bodySnippet,
  });
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
  await assertOk(res, "repository lookup");

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

const repoCatalogSchema = z.object({
  name: z.string().min(1),
  full_name: z.string().min(1),
  html_url: z.string().url(),
  description: z.string().nullable().optional(),
  language: z.string().nullable().optional(),
  stargazers_count: z.number().int().nonnegative(),
  forks_count: z.number().int().nonnegative(),
  open_issues_count: z.number().int().nonnegative(),
  license: z
    .object({
      name: z.string().nullable().optional(),
      spdx_id: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  // GitHub's own repository topics (the same field
  // src/lib/githubDiscovery.ts's search results already carry as
  // `GithubCatalogRepoItem.topics`). Optional here because this schema
  // is also relied on by callers that fetched a repo before topics were
  // read from it — a repo response missing this key simply yields no
  // topics rather than failing to parse (rule 52: validate the shape,
  // but don't make an unrelated field mandatory retroactively).
  topics: z.array(z.string()).optional(),
  created_at: z.string(),
  pushed_at: z.string(),
  private: z.boolean(),
  owner: githubIdentitySchema,
});

export interface GitHubRepoCatalogSummary {
  name: string;
  fullName: string;
  htmlUrl: string;
  description: string | null;
  primaryLanguage: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  /** SPDX-style license identifier (e.g. "MIT"), or `null` if GitHub reports none/unrecognized. */
  license: string | null;
  /** Raw GitHub repository topics — see `mapGithubTopicsToTechStack` (src/lib/techTopics.ts) for turning these into a tech-stack tag list. */
  topics: string[];
  createdAt: string;
  pushedAt: string;
  isPrivate: boolean;
  owner: OnboardingGithubIdentity;
}

/**
 * "Fetch repository catalog summary" — the read-only, publish-a-catalog-
 * page counterpart to `fetchRepositoryMetadata` above. Deliberately a
 * separate function rather than widening `fetchRepositoryMetadata` /
 * `GitHubRepoMetadata`: that pair is already relied on by Project
 * Onboarding (src/routes/projectOnboarding.ts), the Admin Projects sync
 * (src/db/adminProjects.ts), and Open Source Tool onboarding
 * (src/lib/toolSource.ts) — changing its shape risks breaking three
 * unrelated call sites for a set of fields (`license`, `createdAt`,
 * `pushedAt`, full owner identity) only the GitHub Projects catalog
 * (`GET /github-projects`, src/routes/githubProjects.ts) actually needs
 * (Backend_Development_Rules.txt rule 4: never rewrite working
 * functionality unnecessarily).
 *
 * `license` prefers GitHub's own SPDX identifier (`spdx_id`, e.g. "MIT"),
 * falling back to the license's plain `name` only when GitHub reports
 * `"NOASSERTION"` (its sentinel for "has a LICENSE file GitHub couldn't
 * confidently classify") — never fabricates a license GitHub didn't
 * actually detect (rule 38).
 */
export async function fetchRepositoryCatalogSummary(
  accessToken: string | null,
  owner: string,
  repo: string,
): Promise<GitHubRepoCatalogSummary> {
  const res = await fetchWithTimeout(`${GITHUB_API_BASE}/repos/${owner}/${repo}`, {
    headers: authHeaders(accessToken),
  });
  await assertOk(res, "repository catalog lookup");

  const parsed = repoCatalogSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new GitHubRepoError("github_unavailable", "Unexpected GitHub repository response shape");
  }
  const data = parsed.data;

  const license =
    data.license?.spdx_id && data.license.spdx_id !== "NOASSERTION"
      ? data.license.spdx_id
      : (data.license?.name ?? null);

  return {
    name: data.name,
    fullName: data.full_name,
    htmlUrl: data.html_url,
    description: data.description ?? null,
    primaryLanguage: data.language ?? null,
    stars: data.stargazers_count,
    forks: data.forks_count,
    openIssues: data.open_issues_count,
    license,
    topics: data.topics ?? [],
    createdAt: data.created_at,
    pushedAt: data.pushed_at,
    isPrivate: data.private,
    owner: toIdentity(data.owner),
  };
}

const issueSearchCountSchema = z.object({
  total_count: z.number().int().nonnegative(),
});

export interface GitHubRepoIssueCounts {
  openIssues: number;
  closedIssues: number;
}

/**
 * "Fetch open/closed issue counts" — replaces the naive
 * `repos/{owner}/{repo}` `open_issues_count` field
 * (`fetchRepositoryMetadata.openIssues` above), which is a well-known
 * GitHub API quirk: it silently counts open *pull requests* alongside
 * open issues, and GitHub's repo-metadata endpoint has no closed-issue
 * counterpart at all.
 *
 * Uses the Search API's `type:issue` qualifier instead, which excludes
 * pull requests by construction, and asks for `state:open` and
 * `state:closed` as two independent counts (never derived from one
 * another — a repo's total issue count can change between the two
 * requests, so treating `closed = total - open` would be a fabricated
 * number, not a measured one — rule 38: never fake a metric). Only
 * `total_count` from each search response is used; the (paginated) issue
 * list itself is discarded since only the counts are needed here.
 */
export async function fetchRepositoryIssueCounts(
  accessToken: string | null,
  owner: string,
  repo: string,
): Promise<GitHubRepoIssueCounts> {
  const search = async (state: "open" | "closed"): Promise<number> => {
    const query = encodeURIComponent(`repo:${owner}/${repo} type:issue state:${state}`);
    const res = await fetchWithTimeout(
      `${GITHUB_API_BASE}/search/issues?q=${query}&per_page=1`,
      { headers: authHeaders(accessToken) },
    );
    await assertOk(res, `issue ${state} count lookup`);

    const parsed = issueSearchCountSchema.safeParse(await res.json());
    if (!parsed.success) {
      throw new GitHubRepoError(
        "github_unavailable",
        "Unexpected GitHub issue search response shape",
      );
    }
    return parsed.data.total_count;
  };

  const [openIssues, closedIssues] = await Promise.all([search("open"), search("closed")]);
  return { openIssues, closedIssues };
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
    await assertOk(res, "contributors lookup");
  }

  const parsed = contributorsSchema.safeParse(await res.json());
  if (!parsed.success) return [];
  return parsed.data.map(toIdentity);
}

/**
 * True total contributor count for a repository — NOT
 * `fetchRepositoryContributors(...).length`, which is deliberately capped
 * at `limit` (25 by default) to keep the onboarding/detail UI's avatar
 * list bounded (rule 67) and is never meant to double as a total.
 *
 * GitHub's `/contributors` endpoint has no count field in its body. The
 * standard trick to get the real total without paging through every
 * contributor: request `per_page=1` and read the page number out of the
 * paginated `Link` response header's `rel="last"` entry — with exactly 1
 * contributor per page, that page number IS the total contributor count.
 * No `Link` header at all means everything fit on the single page
 * returned, so the total is just that page's length (0 or 1).
 */
export async function fetchRepositoryContributorCount(
  accessToken: string | null,
  owner: string,
  repo: string,
): Promise<number> {
  // NOTE: anon=true (not anon=false) is required here. GitHub only links
  // the first 500 author *email addresses* to GitHub accounts; with
  // anon=false every other contributor — anyone whose commits don't
  // resolve to one of those 500 identified accounts — is silently
  // dropped from the response entirely, not just hidden. For a repo with
  // (say) 1,500 real contributors, that can leave only a few hundred
  // countable via the per_page=1/Link-header trick below, wildly
  // undercounting the true total. anon=true counts every distinct commit
  // author (identified or not), which is what a "total contributors"
  // figure should reflect.
  const res = await fetchWithTimeout(
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/contributors?per_page=1&anon=true`,
    { headers: authHeaders(accessToken) },
  );

  // A repository whose commit history/contributor list is too large for
  // GitHub to compute on demand (e.g. torvalds/linux, chromium/chromium)
  // returns a 403 with a distinct message here rather than data — treat
  // that the same as "no contributors yet" so one huge repo can't fail
  // the whole sync.
  if (res.status === 204) return 0;
  if (!res.ok) {
    if (res.status === 404) return 0;
    if (res.status === 403) {
      const body = await res.text();
      if (/too large to list contributors/i.test(body)) return 0;
    }
    await assertOk(res, "contributor count lookup");
  }

  const link = res.headers.get("Link") ?? res.headers.get("link");
  if (link) {
    const lastPageMatch = link.match(/[?&]page=(\d+)[^>]*>;\s*rel="last"/);
    if (lastPageMatch) return Number(lastPageMatch[1]);
  }

  const parsed = contributorsSchema.safeParse(await res.json());
  if (!parsed.success) return 0;
  return parsed.data.length;
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
  await assertOk(res, "issues lookup");

  const parsed = z.array(githubIssueSchema).safeParse(await res.json());
  if (!parsed.success) {
    throw new GitHubRepoError("github_unavailable", "Unexpected GitHub issues response shape");
  }

  return parsed.data.filter((issue) => !issue.pull_request).map(toIssueSummary);
}

/**
 * Safety ceiling for `fetchAllRepositoryIssues` below — a hard cap on how
 * many open issues one repository can contribute to a single New Issues
 * scan (`GET /admin/new-issues`), independent of how many pages that
 * takes to walk. Protects the per-call GitHub rate-limit budget (rule 67)
 * against a single very large repository (thousands of open issues)
 * blowing through it on every admin page load. 1000 is generously above
 * any repository this platform has onboarded so far; if a repository
 * ever legitimately exceeds it, this function still returns its most
 * recently updated 1000 open issues rather than failing outright.
 */
const MAX_SCANNED_ISSUES = 1000;

/**
 * Parses the `next` URL out of a GitHub API response's `Link` header
 * (RFC 5988), e.g. `<https://api.github.com/...&page=2>; rel="next", ...`.
 * Returns `null` once GitHub stops sending a `rel="next"` entry — the
 * signal that the current page was the last one.
 */
function parseNextLinkUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match) return match[1] ?? null;
  }
  return null;
}

/**
 * "Fetch Issues" for `GET /admin/new-issues`'s New Issue Detection scan
 * (admin_workflow.txt section 9 / section 16) — unlike `fetchRepositoryIssues`
 * above (a deliberately first-page-only picker for Task Onboarding), this
 * walks every page of a repository's open issues via GitHub's `Link:
 * rel="next"` pagination, because a diff against DevTunnel's covered/
 * ignored issues has to see the *entire* open backlog to be correct — a
 * repository with, say, 122 open issues must contribute all 122 to the
 * scan, not just its most-recently-updated 50 (the bug this function
 * fixes: previously every project was silently truncated to one page,
 * so New Issues undercounted for any project with more open issues than
 * that page size).
 *
 * Requests the largest page size GitHub allows (100) to minimize round
 * trips, and stops at `MAX_SCANNED_ISSUES` (see above) as a hard safety
 * ceiling rather than looping unbounded.
 */
export async function fetchAllRepositoryIssues(
  accessToken: string | null,
  owner: string,
  repo: string,
): Promise<GithubIssueSummary[]> {
  const { issues } = await walkOpenIssues(accessToken, owner, repo, MAX_SCANNED_ISSUES);
  return issues;
}

export interface RepositoryIssueListing {
  /** Open issues (never pull requests), most recently updated first. */
  issues: GithubIssueSummary[];
  /**
   * `true` when the repository has more open issues than `issues`
   * holds — the walk stopped at the cap rather than at GitHub's last
   * page. Lets the UI say "showing the N most recently updated" instead
   * of implying the list is complete.
   */
  truncated: boolean;
}

/**
 * Same full-backlog walk `fetchAllRepositoryIssues` does, but also
 * reports whether the cap cut the list short. Backs the contributor-
 * facing "Load all issues" action on the four detail pages
 * (`lib/repoIssuesList.ts`), which — unlike the admin New Issues scan —
 * has to tell the person looking at the list whether it's complete.
 *
 * Reuses `MAX_SCANNED_ISSUES` as the default ceiling on purpose: one
 * number bounding how much GitHub rate-limit budget a single repository
 * can cost, whichever feature is asking.
 */
export async function fetchRepositoryIssueListing(
  accessToken: string | null,
  owner: string,
  repo: string,
  cap: number = MAX_SCANNED_ISSUES,
): Promise<RepositoryIssueListing> {
  return walkOpenIssues(accessToken, owner, repo, cap);
}

/**
 * Shared page-by-page walk behind `fetchAllRepositoryIssues` and
 * `fetchRepositoryIssueListing`. Stops once `cap` issues are collected;
 * `truncated` is `true` only when GitHub still had another page to
 * offer at that point (a repository with exactly `cap` open issues and
 * no further page is *not* truncated). The one imprecision: if that
 * next page turns out to hold only pull requests it still reports
 * `truncated`, which errs toward "there may be more" — the safe
 * direction for a message that points the reader at GitHub.
 */
async function walkOpenIssues(
  accessToken: string | null,
  owner: string,
  repo: string,
  cap: number,
): Promise<RepositoryIssueListing> {
  const results: GithubIssueSummary[] = [];
  let truncated = false;
  let url: string | null =
    `${GITHUB_API_BASE}/repos/${owner}/${repo}/issues?state=open&per_page=100&sort=updated&direction=desc`;

  while (url) {
    if (results.length >= cap) {
      truncated = true;
      break;
    }

    const res = await fetchWithTimeout(url, { headers: authHeaders(accessToken) });
    await assertOk(res, "issues lookup");

    const parsed = z.array(githubIssueSchema).safeParse(await res.json());
    if (!parsed.success) {
      throw new GitHubRepoError("github_unavailable", "Unexpected GitHub issues response shape");
    }

    for (const issue of parsed.data) {
      if (!issue.pull_request) results.push(toIssueSummary(issue));
    }

    url = parseNextLinkUrl(res.headers.get("Link"));
  }

  if (results.length > cap) truncated = true;

  return { issues: results.slice(0, cap), truncated };
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
  await assertOk(res, "issue lookup");

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

/**
 * Stars/unstars a repository **on GitHub itself**, on behalf of the
 * signed-in contributor — backs the "Star" action on both the Project
 * Detail and Open Source Tools Detail pages (routes/githubProjects.ts,
 * routes/githubOpenSourceTools.ts): starring a repository in DevTunnel
 * is meant to actually star it on the contributor's real GitHub
 * account, not just record a DevTunnel-local preference.
 *
 * Unlike every other function in this file, `accessToken` here is
 * required, not optional — GitHub's star endpoints
 * (`PUT`/`DELETE /user/starred/{owner}/{repo}`) act "for the
 * authenticated user" and have no meaningful anonymous/unauthenticated
 * form the way a public repo *read* does. Callers must resolve a live
 * per-user token first (`getValidGithubAccessToken`,
 * `db/githubTokens.ts`) and respond `403 github_reauth_required`
 * themselves when there isn't one — mirroring
 * `routes/contributions.ts`'s `resolveAccessTokenOrRespond` — rather
 * than this function silently falling back to an unauthenticated call
 * that would always 404.
 *
 * Both endpoints respond `204 No Content` on success with no JSON
 * body, and are idempotent on GitHub's side (starring an
 * already-starred repo, or unstarring an already-unstarred one, is
 * still a `204`) — so callers don't need to pre-check GitHub's own
 * star status before calling either of these.
 *
 * Requires this backend's GitHub App to have the "Starring" user
 * permission granted (GitHub App → Permissions & events → Account
 * permissions → Starring: Read and write) — without it, GitHub
 * responds `403`, which surfaces here as `GitHubRepoError` with
 * reason `"unauthorized"` via `assertOk`, same as any other
 * insufficient-permission response.
 */
export async function starRepositoryForUser(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<void> {
  const res = await fetchWithTimeout(`${GITHUB_API_BASE}/user/starred/${owner}/${repo}`, {
    method: "PUT",
    headers: { ...authHeaders(accessToken), "Content-Length": "0" },
  });
  await assertOk(res, "star repository");
}

/** See `starRepositoryForUser` above — same contract, in reverse. */
export async function unstarRepositoryForUser(
  accessToken: string,
  owner: string,
  repo: string,
): Promise<void> {
  const res = await fetchWithTimeout(`${GITHUB_API_BASE}/user/starred/${owner}/${repo}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
  });
  await assertOk(res, "unstar repository");
}