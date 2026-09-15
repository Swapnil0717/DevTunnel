import type { ValidatedEnv } from "../config/env";
import { logger } from "./logger";

/**
 * Server-initiated GitHub REST/Search API calls for the AI Discovery
 * agent. Distinct from src/lib/githubRepo.ts (which acts on behalf of a
 * signed-in admin's OAuth token during onboarding) — this always uses
 * GITHUB_DISCOVERY_TOKEN, a token this backend controls, never a user's.
 */

const GITHUB_API = "https://api.github.com";

function headers(env: ValidatedEnv): HeadersInit {
  return {
    Authorization: `Bearer ${env.GITHUB_DISCOVERY_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "devtunnel-ai-discovery",
  };
}

async function githubGet<T>(env: ValidatedEnv, path: string): Promise<T | null> {
  const res = await fetch(`${GITHUB_API}${path}`, { headers: headers(env) });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logger.warn("github_discovery_request_failed", { path, status: res.status, body: body.slice(0, 300) });
    throw new Error(`GitHub API ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}

export interface GithubSearchRepoItem {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  owner: { login: string };
  name: string;
  archived: boolean;
  fork: boolean;
}

/** GitHub's `/search/repositories` — used by the project & tool discovery tools. */
export async function searchRepositories(
  env: ValidatedEnv,
  query: string,
  sort: "stars" | "updated" | "best-match" = "stars",
  perPage = 10,
): Promise<GithubSearchRepoItem[]> {
  const sortParam = sort === "best-match" ? "" : `&sort=${sort}&order=desc`;
  const data = await githubGet<{ items: GithubSearchRepoItem[] }>(
    env,
    `/search/repositories?q=${encodeURIComponent(query)}${sortParam}&per_page=${perPage}`,
  );
  return data?.items?.filter((r) => !r.archived && !r.fork) ?? [];
}

export interface GithubSearchIssueItem {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  labels: Array<{ name: string } | string>;
  user: { login: string; avatar_url: string | null; html_url: string } | null;
  comments: number;
  created_at: string;
  updated_at: string;
  pull_request?: unknown;
  repository_url: string;
}

/**
 * GitHub's `/search/issues` — used by task discovery. `perPage` is kept
 * small (not GitHub's usual default of 20-30) because every issue this
 * returns gets resent in full on every subsequent Groq turn as part of
 * the growing conversation history — 20 issues at the old body-truncation
 * length alone exceeded the entire 6,500 TPM per-minute budget
 * (groqQuota.ts), which is what caused ai_project_discovery_quota_exceeded
 * runs that produced zero candidates. 8 is comfortably under budget even
 * stacked with other tool results earlier in the same run.
 *
 * GitHub's `/search/issues` endpoint 422s any query missing `is:issue` or
 * `is:pull-request` — the model doesn't reliably remember to include
 * this, so every omission burned a whole turn on a 422 and, seen enough
 * times in one run, exhausted MAX_TURNS before a final answer ever came
 * back (ai_project_discovery_failed: "Groq agent exceeded max turns").
 * Enforced here instead of only in the tool description, so a malformed
 * query from the model can never actually reach GitHub as an error.
 */
export async function searchIssues(env: ValidatedEnv, query: string, perPage = 8): Promise<GithubSearchIssueItem[]> {
  const qualifiedQuery = /\bis:(issue|pull-request)\b/i.test(query) ? query : `${query} is:issue`;
  const data = await githubGet<{ items: GithubSearchIssueItem[] }>(
    env,
    `/search/issues?q=${encodeURIComponent(qualifiedQuery)}&sort=created&order=desc&per_page=${perPage}`,
  );
  // Search /issues also returns PRs; filter those out.
  return (data?.items ?? []).filter((i) => !i.pull_request);
}

export interface GithubRepoDetail {
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  html_url: string;
  default_branch: string;
  owner: { login: string };
  name: string;
}

export async function getRepository(env: ValidatedEnv, owner: string, repo: string): Promise<GithubRepoDetail | null> {
  return githubGet<GithubRepoDetail>(env, `/repos/${owner}/${repo}`);
}

export async function getRepositoryReadme(env: ValidatedEnv, owner: string, repo: string): Promise<string | null> {
  const data = await githubGet<{ content: string; encoding: string }>(env, `/repos/${owner}/${repo}/readme`);
  if (!data || data.encoding !== "base64") return null;
  try {
    // atob is available in the Workers runtime (nodejs_compat).
    const binary = atob(data.content.replace(/\n/g, ""));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    // Shrunk from 6000: a single README this size, stacked with a few
    // tool results already in the conversation, could push one Groq
    // turn's request past the 6,500 TPM budget (groqQuota.ts) on its
    // own. 4000 chars (~1,150 estimated tokens) leaves more headroom.
    return new TextDecoder("utf-8").decode(bytes).slice(0, 4000);
  } catch {
    return null;
  }
}

export interface GithubRepoIssue {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  labels: Array<{ name: string } | string>;
  user: { login: string; avatar_url: string | null; html_url: string } | null;
  comments: number;
  created_at: string;
  updated_at: string;
  pull_request?: unknown;
}

/**
 * Open issues for one repo, used by task discovery when a repo has few
 * issues to search-index. Same TPM-budget reasoning as searchIssues
 * above applies to `perPage` here.
 */
export async function getRepositoryOpenIssues(
  env: ValidatedEnv,
  owner: string,
  repo: string,
  perPage = 8,
): Promise<GithubRepoIssue[]> {
  const data = await githubGet<GithubRepoIssue[]>(
    env,
    `/repos/${owner}/${repo}/issues?state=open&per_page=${perPage}&sort=created&direction=desc`,
  );
  return (data ?? []).filter((i) => !i.pull_request);
}

export function normalizeLabels(labels: Array<{ name: string } | string>): string[] {
  return labels.map((l) => (typeof l === "string" ? l : l.name)).filter(Boolean);
}

/**
 * One repository as returned by GitHub's `/search/repositories`, trimmed
 * to the fields `GET /github-projects` (src/routes/githubProjects.ts)
 * needs to build a `GithubProjectSummary` (devtunnel-frontend's
 * `lib/github-projects/types.ts`). Deliberately a separate type from
 * `GithubSearchRepoItem` above rather than an extension of it — that
 * type is shared with the AI Discovery agent's tool-calling loop and
 * kept minimal on purpose (see its own field-by-field comments); this
 * catalog has different, additional needs (license, timestamps, topics)
 * that agent has no use for.
 */
export interface GithubCatalogRepoItem {
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  owner: { login: string; avatar_url: string | null; html_url: string };
  archived: boolean;
  fork: boolean;
  private: boolean;
  license: { spdx_id: string | null; name: string } | null;
  created_at: string;
  pushed_at: string;
  topics?: string[];
}

/**
 * GitHub's Search API hard-caps any single query at 1,000 results total
 * (`page` * `per_page` beyond that just 422s) — there is no way to
 * paginate past it, so this is a genuine ceiling, not a tuning knob.
 * 100 is the largest `per_page` GitHub allows, so 10 pages is the most
 * results one query can ever return.
 */
const MAX_CATALOG_PAGES = 10;
const CATALOG_PER_PAGE = 100;

/**
 * Walks GitHub's `/search/repositories` for `GET /github-projects`
 * (src/routes/githubProjects.ts) — "every open-source project on
 * GitHub", not just repositories DevTunnel has onboarded. There is no
 * GitHub endpoint that literally lists all ~400M repositories on the
 * platform, and returning that many rows would be useless to a
 * contributor anyway, so this samples the slice an "explore open source"
 * page actually wants: real, public, non-archived, non-fork projects,
 * ordered by popularity (`sort=stars`), up to the Search API's own
 * 1,000-result ceiling (see `MAX_CATALOG_PAGES`).
 *
 * `archived`, `fork`, and `private` are all re-checked here even though
 * `query` already asks for `archived:false fork:false is:public` —
 * defense in depth (same "don't rely on the query string alone" posture
 * `searchRepositories` above already takes for archived/fork), and
 * because `is:public` is a *search* filter, not a guarantee GitHub can
 * never regress — an explicit client-side `!item.private` check is a
 * second, independent guard against ever surfacing a private repository
 * to a contributor via this discovery-token-backed catalog.
 */
export async function searchOpenSourceCatalog(
  env: ValidatedEnv,
  query: string,
): Promise<GithubCatalogRepoItem[]> {
  const results: GithubCatalogRepoItem[] = [];

  for (let page = 1; page <= MAX_CATALOG_PAGES; page++) {
    const data = await githubGet<{ items: GithubCatalogRepoItem[] }>(
      env,
      `/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${CATALOG_PER_PAGE}&page=${page}`,
    );
    const items = data?.items ?? [];
    if (items.length === 0) break;

    for (const item of items) {
      if (!item.archived && !item.fork && !item.private) results.push(item);
    }

    // A short page means this was GitHub's last page — stop rather than
    // spending an extra call to confirm an empty page 11.
    if (items.length < CATALOG_PER_PAGE) break;
  }

  return results;
}