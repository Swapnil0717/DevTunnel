// devtunnel-backend/src/lib/aiDiscoveryTools.ts
import type { ValidatedEnv } from "../config/env";
import type { GroqFunctionDeclaration } from "./groq";
import {
  getRepository,
  getRepositoryOpenIssues,
  getRepositoryReadme,
  normalizeLabels,
  searchIssues,
  searchRepositories,
} from "./githubDiscovery";

/**
 * Every function the discovery model is allowed to call during
 * discovery. The model decides what to search for and how many times — this file only
 * declares the surface and executes real GitHub API calls; it never
 * fabricates a result (rule 37/38 applied to an AI's tool use, not just
 * the database).
 */
export const DISCOVERY_TOOLS: GroqFunctionDeclaration[] = [
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
      "Search GitHub issues using GitHub's search syntax. The query MUST include 'is:issue' (e.g. 'repo:owner/name is:issue is:open label:\"good first issue\"') — GitHub rejects queries missing 'is:issue' or 'is:pull-request'. Returns up to 8 real open issues with title, body, labels, and author.",
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
 * caches that too — so a candidate whose README the model never
 * explicitly re-fetched right before answering still gets one attached. Never
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
 * Called with a short, human-readable description of one step of the
 * discovery process as it happens (e.g. "Searching GitHub for…", "Reading
 * README for owner/repo…"). Purely observational — never affects control
 * flow. Used to stream live progress to the admin UI (see
 * routes/admin/ai.ts's `/run-one` SSE endpoints).
 */
export type StepReporter = (message: string) => void;

/**
 * GitHub allows a repo `description` to be arbitrarily long via the API
 * even though the web UI caps what you can type — and generic queries
 * like "good first issue language:python" are known to surface
 * spam/SEO-stuffed repos that abuse exactly this gap. That's what
 * produced the ~132,702-char tool result (see groq.ts's
 * `groq_tool_result_oversized` log): `search_github_repositories` /
 * `get_github_repository` returned one repo's description verbatim, no
 * matter its length. A description this long adds nothing for the model
 * — it only needs enough to judge relevance — so it's truncated well
 * below the generic `MAX_FIELD_CHARS` backstop below.
 */
const MAX_DESCRIPTION_CHARS = 400;

function truncateDescription(description: string | null): string | null {
  if (!description) return description;
  return description.length > MAX_DESCRIPTION_CHARS
    ? `${description.slice(0, MAX_DESCRIPTION_CHARS)}…[truncated]`
    : description;
}

/**
 * Generic backstop applied to every dispatch result, not just
 * `description`: caps any string anywhere in the returned value at
 * `MAX_FIELD_CHARS`. This is deliberately dumb (no per-field reasoning)
 * so a *future* GitHub field that turns out to be unbounded — one we
 * haven't hit yet and so haven't given its own intentional cap like
 * `truncateDescription` above — can't repeat this bug. Fields we've
 * already reasoned about (description, issue body) keep their tighter,
 * intentional limits; this just catches everything else.
 */
const MAX_FIELD_CHARS = 2000;

function capStrings<T>(value: T, maxChars: number = MAX_FIELD_CHARS): T {
  if (typeof value === "string") {
    return (value.length > maxChars ? `${value.slice(0, maxChars)}…[truncated]` : value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => capStrings(v, maxChars)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = capStrings(v, maxChars);
    }
    return out as T;
  }
  return value;
}

/**
 * Builds the tool dispatcher Groq's agent loop calls into. When a
 * `readmeCache` is supplied, every real `get_github_readme` result is
 * recorded into it as a side effect — this is what lets
 * aiDiscoveryAgent.ts attach the README it already fetched during
 * discovery to the candidate it ends up inserting, instead of either
 * discarding it (the previous behavior) or re-fetching it a second time
 * for the same repo.
 *
 * When `onStep` is supplied, every dispatched tool call reports what it's
 * doing (and a short summary of what came back) through it, in real time,
 * before/after the actual network call — this is the only place that
 * knows the true, real-time sequence of GitHub calls the model chose to
 * make, so it's the right place to source step-by-step progress from
 * (rather than guessing the sequence in aiDiscoveryAgent.ts).
 *
 * Every case's return value passes through `capStrings` before it
 * reaches Groq — see that function's comment for why this exists
 * alongside the more targeted `truncateDescription`.
 */
export function buildDiscoveryDispatcher(env: ValidatedEnv, readmeCache?: ReadmeCache, onStep?: StepReporter) {
  return async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const result = await (async (): Promise<unknown> => {
      switch (name) {
        case "search_github_repositories": {
          onStep?.(`Searching GitHub repositories: ${String(args.query)}`);
          const items = await searchRepositories(env, String(args.query), (args.sort as "stars" | "updated" | "best-match") ?? "stars");
          onStep?.(`Found ${items.length} repositor${items.length === 1 ? "y" : "ies"} for "${String(args.query)}"`);
          return items.map((r) => ({
            fullName: r.full_name,
            url: r.html_url,
            description: truncateDescription(r.description),
            language: r.language,
            stars: r.stargazers_count,
            forks: r.forks_count,
            openIssues: r.open_issues_count,
          }));
        }
        case "get_github_repository": {
          const owner = String(args.owner);
          const repo = String(args.repo);
          onStep?.(`Fetching repository details for ${owner}/${repo}`);
          const repoData = await getRepository(env, owner, repo);
          if (!repoData) {
            onStep?.(`${owner}/${repo} not found on GitHub`);
            return { error: "not_found" };
          }
          onStep?.(`Got details for ${owner}/${repo}`);
          return {
            fullName: repoData.full_name,
            url: repoData.html_url,
            description: truncateDescription(repoData.description),
            language: repoData.language,
            stars: repoData.stargazers_count,
            forks: repoData.forks_count,
            openIssues: repoData.open_issues_count,
          };
        }
        case "get_github_readme": {
          const owner = String(args.owner);
          const repo = String(args.repo);
          onStep?.(`Reading README for ${owner}/${repo}`);
          const readme = await getRepositoryReadme(env, owner, repo);
          if (readme && readmeCache) {
            readmeCache.set(readmeCacheKey(owner, repo), readme);
          }
          onStep?.(readme ? `Read README for ${owner}/${repo}` : `No README found for ${owner}/${repo}`);
          return { readme: readme ?? "" };
        }
        case "search_github_issues": {
          onStep?.(`Searching GitHub issues: ${String(args.query)}`);
          const items = await searchIssues(env, String(args.query));
          onStep?.(`Found ${items.length} issue${items.length === 1 ? "" : "s"} for "${String(args.query)}"`);
          // Body truncation shrunk from 1500: at the old length, a full
          // page of results alone could exceed the entire Groq TPM budget
          // (see searchIssues' perPage comment in githubDiscovery.ts).
          return items.map((i) => ({
            number: i.number,
            title: i.title,
            url: i.html_url,
            body: (i.body ?? "").slice(0, 600),
            labels: normalizeLabels(i.labels),
            author: i.user ? { username: i.user.login, avatarUrl: i.user.avatar_url, profileUrl: i.user.html_url } : null,
            repositoryUrl: i.repository_url,
          }));
        }
        case "get_github_repository_open_issues": {
          const owner = String(args.owner);
          const repo = String(args.repo);
          onStep?.(`Listing open issues for ${owner}/${repo}`);
          const items = await getRepositoryOpenIssues(env, owner, repo);
          onStep?.(`Found ${items.length} open issue${items.length === 1 ? "" : "s"} on ${owner}/${repo}`);
          return items.map((i) => ({
            number: i.number,
            title: i.title,
            url: i.html_url,
            body: (i.body ?? "").slice(0, 600),
            labels: normalizeLabels(i.labels),
            author: i.user ? { username: i.user.login, avatarUrl: i.user.avatar_url, profileUrl: i.user.html_url } : null,
          }));
        }
        default:
          return { error: `unknown_tool:${name}` };
      }
    })();
    return capStrings(result);
  };
}