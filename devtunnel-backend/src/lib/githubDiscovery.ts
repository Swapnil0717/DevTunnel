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

/** GitHub's `/search/issues` — used by task discovery. */
export async function searchIssues(env: ValidatedEnv, query: string, perPage = 20): Promise<GithubSearchIssueItem[]> {
  const data = await githubGet<{ items: GithubSearchIssueItem[] }>(
    env,
    `/search/issues?q=${encodeURIComponent(query)}&sort=created&order=desc&per_page=${perPage}`,
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
    return new TextDecoder("utf-8").decode(bytes).slice(0, 6000);
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

/** Open issues for one repo, used by task discovery when a repo has few issues to search-index. */
export async function getRepositoryOpenIssues(
  env: ValidatedEnv,
  owner: string,
  repo: string,
  perPage = 20,
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