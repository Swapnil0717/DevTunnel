/**
 * What the user typed after `dev start` / `dev submit`, resolved to either:
 *   - a DevTunnel task / project id (a UUID), or
 *   - any GitHub repo, optionally with an issue number.
 *
 * Accepted GitHub forms:
 *   owner/repo
 *   owner/repo#123
 *   owner/repo/issues/123
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/issues/123
 */
export type TargetRef =
  | { kind: "devtunnel"; id: string }
  | { kind: "github"; repo: string; issue?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAME = "[A-Za-z0-9_.-]+";

export function parseTarget(input: string): TargetRef | null {
  const raw = input.trim();
  if (UUID.test(raw)) return { kind: "devtunnel", id: raw };

  const cleaned = raw
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");

  const hash = cleaned.match(new RegExp(`^(${NAME}/${NAME})#(\\d+)$`));
  if (hash) return { kind: "github", repo: hash[1]!, issue: Number(hash[2]) };

  const path = cleaned.match(new RegExp(`^(${NAME}/${NAME})/(?:issues|pull)/(\\d+)(?:[/?#].*)?$`));
  if (path) return { kind: "github", repo: path[1]!, issue: Number(path[2]) };

  const plain = cleaned.match(new RegExp(`^(${NAME}/${NAME})$`));
  if (plain) return { kind: "github", repo: plain[1]! };

  return null;
}

/** `owner/repo` from a git remote URL (https or ssh), or null. */
export function repoFromRemoteUrl(url: string): string | null {
  const m = url.trim().match(/github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?$/i);
  return m ? m[1]! : null;
}

/** Issue number from a branch like `fix/123-some-title`, or undefined. */
export function issueFromBranch(branch: string): number | undefined {
  const m = branch.match(/^[^/]+\/(\d+)-/);
  return m ? Number(m[1]) : undefined;
}
