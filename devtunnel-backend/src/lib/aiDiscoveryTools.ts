import type { ValidatedEnv } from "../config/env";
import type { GeminiFunctionDeclaration } from "./gemini";
import {
  getRepository,
  getRepositoryOpenIssues,
  getRepositoryReadme,
  normalizeLabels,
  searchIssues,
  searchRepositories,
} from "./githubDiscovery";

/**
 * Every function Gemini is allowed to call during discovery. Gemini
 * decides what to search for and how many times — this file only
 * declares the surface and executes real GitHub API calls; it never
 * fabricates a result (rule 37/38 applied to an AI's tool use, not just
 * the database).
 */
export const DISCOVERY_TOOLS: GeminiFunctionDeclaration[] = [
  {
    name: "search_github_repositories",
    description:
      "Search public GitHub repositories using GitHub's search syntax (e.g. 'topic:cli language:go stars:>100'). Returns up to 10 real repositories with stars, forks, language, and description.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "GitHub search-repositories query string." },
        sort: { type: "string", enum: ["stars", "updated", "best-match"] },
      },
      required: ["query"],
    },
  },
  {
    name: "get_github_repository",
    description: "Fetch full details (stars, forks, open issues, language, description) for one exact owner/repo.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "get_github_readme",
    description: "Fetch the README (truncated) for one exact owner/repo, to judge documentation quality and contributor-friendliness.",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "search_github_issues",
    description:
      "Search GitHub issues using GitHub's search syntax (e.g. 'repo:owner/name is:issue is:open label:\"good first issue\"'). Returns up to 20 real open issues with title, body, labels, and author.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_github_repository_open_issues",
    description: "List open issues directly on one exact owner/repo (use when a repo has too few issues for search indexing to have caught up).",
    parameters: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
];

/** `owner/repo` (lowercased) -> full README text, shared across one discovery run. */
export type ReadmeCache = Map<string, string>;

export function readmeCacheKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}

/**
 * Returns the README for owner/repo, preferring whatever's already in
 * `readmeCache` (populated by a `get_github_readme` tool call during this
 * same run) over hitting GitHub again. Falls back to a direct fetch — and
 * caches that too — so a candidate whose README Gemini never explicitly
 * re-fetched right before answering still gets one attached. Never
 * throws: a fetch failure here just means `readme` stays null on the
 * candidate, exactly like any other optional field GitHub didn't have.
 */
export async function getReadmeWithCache(
  env: ValidatedEnv,
  readmeCache: ReadmeCache,
  owner: string,
  repo: string,
): Promise<string | null> {
  const key = readmeCacheKey(owner, repo);
  const cached = readmeCache.get(key);
  if (cached) return cached;

  try {
    const readme = await getRepositoryReadme(env, owner, repo);
    if (readme) readmeCache.set(key, readme);
    return readme;
  } catch {
    return null;
  }
}

/**
 * Builds the tool dispatcher Gemini's agent loop calls into. When a
 * `readmeCache` is supplied, every real `get_github_readme` result is
 * recorded into it as a side effect — this is what lets
 * aiDiscoveryAgent.ts attach the README it already fetched during
 * discovery to the candidate it ends up inserting, instead of either
 * discarding it (the previous behavior) or re-fetching it a second time
 * for the same repo.
 */
export function buildDiscoveryDispatcher(env: ValidatedEnv, readmeCache?: ReadmeCache) {
  return async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    switch (name) {
      case "search_github_repositories": {
        const items = await searchRepositories(env, String(args.query), (args.sort as "stars" | "updated" | "best-match") ?? "stars");
        return items.map((r) => ({
          fullName: r.full_name,
          url: r.html_url,
          description: r.description,
          language: r.language,
          stars: r.stargazers_count,
          forks: r.forks_count,
          openIssues: r.open_issues_count,
        }));
      }
      case "get_github_repository": {
        const repo = await getRepository(env, String(args.owner), String(args.repo));
        if (!repo) return { error: "not_found" };
        return {
          fullName: repo.full_name,
          url: repo.html_url,
          description: repo.description,
          language: repo.language,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          openIssues: repo.open_issues_count,
        };
      }
      case "get_github_readme": {
        const owner = String(args.owner);
        const repo = String(args.repo);
        const readme = await getRepositoryReadme(env, owner, repo);
        if (readme && readmeCache) {
          readmeCache.set(readmeCacheKey(owner, repo), readme);
        }
        return { readme: readme ?? "" };
      }
      case "search_github_issues": {
        const items = await searchIssues(env, String(args.query));
        return items.map((i) => ({
          number: i.number,
          title: i.title,
          url: i.html_url,
          body: (i.body ?? "").slice(0, 1500),
          labels: normalizeLabels(i.labels),
          author: i.user ? { username: i.user.login, avatarUrl: i.user.avatar_url, profileUrl: i.user.html_url } : null,
          repositoryUrl: i.repository_url,
        }));
      }
      case "get_github_repository_open_issues": {
        const items = await getRepositoryOpenIssues(env, String(args.owner), String(args.repo));
        return items.map((i) => ({
          number: i.number,
          title: i.title,
          url: i.html_url,
          body: (i.body ?? "").slice(0, 1500),
          labels: normalizeLabels(i.labels),
          author: i.user ? { username: i.user.login, avatarUrl: i.user.avatar_url, profileUrl: i.user.html_url } : null,
        }));
      }
      default:
        return { error: `unknown_tool:${name}` };
    }
  };
}