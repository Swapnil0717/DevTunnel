import { z } from "zod";
import { fetchRepositoryFile } from "./githubRepo";

/**
 * The live GitHub half of the Contribute page: does this repository
 * actually have a contributing guide, and is there anything labelled for
 * a first-time contributor right now.
 *
 * Why this is read rather than stored: both answers change without
 * telling us. A maintainer adds CONTRIBUTING.md, or labels three issues
 * "good first issue", and neither event touches DevTunnel. A column
 * snapshotted at onboarding time would keep insisting the project has no
 * guide months after it got one, and would be presented to a contributor
 * as current (rule 21). So it's fetched and cached in KV by the route,
 * never persisted.
 *
 * Why it matters at all: before this existed, the frontend linked at
 * `/blob/HEAD/CONTRIBUTING.md` unconditionally and sent a chunk of
 * first-time contributors to GitHub's 404 page — the single worst
 * possible first click on a page whose entire job is lowering the
 * barrier to a first contribution.
 */

/** rule 53: never let an external request hang indefinitely. */
const REQUEST_TIMEOUT_MS = 8_000;

const GITHUB_API_BASE = "https://api.github.com";

/**
 * Where projects actually put these files. GitHub itself resolves a
 * repository's community files from the root, `.github/` and `docs/`, so
 * probing only the root would report "no contributing guide" for every
 * project that keeps one in `.github/` — which is most large ones.
 *
 * Case matters to the contents API, so the lowercase variants are listed
 * too. Ordered most-likely-first: the probe stops at the first hit, so a
 * typical repository costs one request, not six.
 */
const CONTRIBUTING_PATHS = [
  "CONTRIBUTING.md",
  ".github/CONTRIBUTING.md",
  "docs/CONTRIBUTING.md",
  "CONTRIBUTING",
  "contributing.md",
];

const CODE_OF_CONDUCT_PATHS = [
  "CODE_OF_CONDUCT.md",
  ".github/CODE_OF_CONDUCT.md",
  "docs/CODE_OF_CONDUCT.md",
  "code_of_conduct.md",
];

/**
 * The two labels worth counting. Not a configurable list on purpose:
 * these are GitHub's own defaults, created on every new repository, and
 * the only two a contributor can rely on meaning the same thing across
 * projects. A per-project label config would be a setting nobody fills
 * in (rule 5).
 *
 * `good first issue` is matched with its legacy spelling too — plenty of
 * long-running repositories still use `good-first-issue`.
 */
const STARTER_LABELS = {
  goodFirstIssue: ['label:"good first issue"', 'label:"good-first-issue"'],
  helpWanted: ['label:"help wanted"', 'label:"help-wanted"'],
} as const;

/** How many starter issues come back with the payload. A preview, not the backlog (rule 67). */
const STARTER_ISSUE_SAMPLE_LIMIT = 5;

export interface StarterIssue {
  number: number;
  title: string;
  url: string;
  labels: string[];
  createdAt: string;
}

export interface ContributionGuideSnapshot {
  /** Blob URL of the repository's contributing guide, or `null` when it has none. */
  contributingUrl: string | null;
  codeOfConductUrl: string | null;
  /** Open issues labelled for newcomers, right now. */
  goodFirstIssueCount: number;
  helpWantedCount: number;
  /** A few of those issues, so the page can show real work rather than just a number. */
  starterIssues: StarterIssue[];
}

/**
 * Same shape as `fetchWithTimeout` in src/lib/githubRepo.ts, kept local
 * rather than exported from there.
 *
 * That module's helper is bound to `GitHubRepoError` and its
 * throw-on-failure contract, which is right for the onboarding paths that
 * must fail loudly when GitHub is unreachable. Everything in this file is
 * the opposite: a degradable extra on a page that renders fine without
 * it, so every function here returns an empty/`null` answer instead of
 * throwing, and the route logs rather than 500s. Widening githubRepo.ts's
 * surface to share fifteen lines would have meant one of the two callers
 * getting error semantics it doesn't want.
 */
async function safeFetch(url: string, token: string | null): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "DevTunnel",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, { headers, signal: controller.signal });
    return res.ok ? res : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const searchCountSchema = z.object({ total_count: z.number().int().nonnegative() });

const searchIssueSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  html_url: z.string().url(),
  created_at: z.string(),
  labels: z.array(z.union([z.string(), z.object({ name: z.string().optional() })])),
  pull_request: z.unknown().optional(),
});

const searchIssuesSchema = z.object({
  total_count: z.number().int().nonnegative(),
  items: z.array(searchIssueSchema),
});

function toLabelNames(raw: z.infer<typeof searchIssueSchema>["labels"]): string[] {
  return raw
    .map((label) => (typeof label === "string" ? label : label.name))
    .filter((name): name is string => typeof name === "string" && name.length > 0);
}

/**
 * Builds the Search API query for one label family.
 *
 * `type:issue` excludes pull requests by construction — the same reason
 * `fetchRepositoryIssueCounts` in githubRepo.ts uses search rather than
 * the repository's `open_issues_count`, which silently counts open PRs.
 * The two spellings are OR-ed in one query so a repository using either
 * is counted once, not twice, and it costs one request rather than two.
 */
function starterQuery(owner: string, repo: string, labels: readonly string[]): string {
  return `repo:${owner}/${repo} type:issue state:open ${labels.join(" ")}`;
}

/**
 * Counts open issues under one label family. Returns 0 — not an error —
 * when GitHub is unreachable or the response doesn't parse.
 *
 * Zero is the honest answer to render either way: the page's copy is
 * "nothing labelled for newcomers right now", which is what a contributor
 * needs to know whether the cause is an empty label or an unreachable
 * API. It never claims issues exist that weren't seen (rule 38).
 */
async function countStarterIssues(
  token: string | null,
  owner: string,
  repo: string,
  labels: readonly string[],
): Promise<number> {
  const query = encodeURIComponent(starterQuery(owner, repo, labels));
  const res = await safeFetch(`${GITHUB_API_BASE}/search/issues?q=${query}&per_page=1`, token);
  if (!res) return 0;

  const parsed = searchCountSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.total_count : 0;
}

/**
 * A handful of real starter issues, newest first. Same degradation as the
 * counts above: an empty array when GitHub can't be reached.
 *
 * Good-first-issue is queried before help-wanted and the result is only
 * topped up from the second query if the first didn't fill the sample —
 * a genuinely beginner-labelled issue is a better first click than a
 * help-wanted one, which often means "hard, and nobody has time".
 */
async function fetchStarterIssues(
  token: string | null,
  owner: string,
  repo: string,
): Promise<StarterIssue[]> {
  const run = async (labels: readonly string[], limit: number): Promise<StarterIssue[]> => {
    if (limit <= 0) return [];
    const query = encodeURIComponent(starterQuery(owner, repo, labels));
    const res = await safeFetch(
      `${GITHUB_API_BASE}/search/issues?q=${query}&per_page=${limit}&sort=created&order=desc`,
      token,
    );
    if (!res) return [];

    const parsed = searchIssuesSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return [];

    return parsed.data.items
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        labels: toLabelNames(issue.labels),
        createdAt: issue.created_at,
      }));
  };

  const beginner = await run(STARTER_LABELS.goodFirstIssue, STARTER_ISSUE_SAMPLE_LIMIT);
  if (beginner.length >= STARTER_ISSUE_SAMPLE_LIMIT) return beginner;

  const helpWanted = await run(
    STARTER_LABELS.helpWanted,
    STARTER_ISSUE_SAMPLE_LIMIT - beginner.length,
  );

  // An issue carrying both labels would otherwise appear twice.
  const seen = new Set(beginner.map((issue) => issue.number));
  return [...beginner, ...helpWanted.filter((issue) => !seen.has(issue.number))];
}

/**
 * Finds the first of `paths` that exists, and returns the blob URL a
 * human can open — `null` when none of them do.
 *
 * `fetchRepositoryFile` already returns `null` for a 404, which is what
 * makes a speculative probe safe. It does download the file body, which
 * is more than an existence check needs; that's accepted rather than
 * adding a second contents helper, since these files are a few kilobytes
 * and the whole snapshot is cached for half an hour per repository.
 *
 * `HEAD` in the returned URL, not a branch name: it resolves to whatever
 * the default branch is called, so this keeps working on a repository
 * that renamed `master` to `main` and on one that never did.
 */
async function findCommunityFile(
  token: string | null,
  owner: string,
  repo: string,
  paths: readonly string[],
): Promise<string | null> {
  for (const path of paths) {
    const content = await fetchRepositoryFile(token, owner, repo, path);
    if (content !== null) {
      return `https://github.com/${owner}/${repo}/blob/HEAD/${path}`;
    }
  }
  return null;
}

/**
 * The whole snapshot for one repository. Every part degrades
 * independently: a failed guide probe doesn't cost the issue counts, and
 * vice versa, because a partly-useful Contribute page is far better than
 * an error one.
 *
 * Callers cache this — it's identical for every viewer, which is exactly
 * what makes it cacheable, and nothing per-viewer is allowed into it.
 */
export async function fetchContributionGuideSnapshot(
  token: string | null,
  owner: string,
  repo: string,
): Promise<ContributionGuideSnapshot> {
  const [contributingUrl, codeOfConductUrl, goodFirstIssueCount, helpWantedCount, starterIssues] =
    await Promise.all([
      findCommunityFile(token, owner, repo, CONTRIBUTING_PATHS),
      findCommunityFile(token, owner, repo, CODE_OF_CONDUCT_PATHS),
      countStarterIssues(token, owner, repo, STARTER_LABELS.goodFirstIssue),
      countStarterIssues(token, owner, repo, STARTER_LABELS.helpWanted),
      fetchStarterIssues(token, owner, repo),
    ]);

  return {
    contributingUrl,
    codeOfConductUrl,
    goodFirstIssueCount,
    helpWantedCount,
    starterIssues,
  };
}