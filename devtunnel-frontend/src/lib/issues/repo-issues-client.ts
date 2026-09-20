// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as
// `lib/github-projects/client-api.ts` and its siblings. Kept out of the
// per-page `api.ts` files, which read request cookies via `next/headers`
// and can only ever run in a Server Component.
import { API_BASE_URL } from "@/lib/config";

/**
 * The four detail pages that can show a repository's issues, keyed by the
 * backend route prefix each one's own detail route already lives under.
 * Every one of them has a `GET <prefix>/:slug/issues` sibling that
 * returns the repository's complete open-issue list — see
 * devtunnel-backend `src/lib/repoIssuesList.ts`.
 *
 * One shared client here instead of one copy per domain's
 * `client-api.ts`: the four endpoints have an identical contract (same
 * query, same `{ issues, truncated }` envelope, same error codes) and
 * differ only in the row type inside `issues`, which callers supply as
 * the type parameter below (Frontend_Development_Rules.txt rule 51).
 */
export type RepoIssuesBasePath =
  | "/github-projects"
  | "/github-open-source-tools"
  | "/projects"
  | "/opensource-tools";

export function repoIssuesPath(basePath: RepoIssuesBasePath, slug: string): string {
  return `${basePath}/${encodeURIComponent(slug)}/issues`;
}

export interface RepoIssuesResult<Row> {
  issues: Row[];
  /**
   * `true` when the repository has more open issues than the backend
   * would return in one go (it caps the walk to protect its GitHub rate
   * limit). The UI says so and links out to GitHub for the remainder,
   * rather than presenting a capped list as if it were complete.
   */
  truncated: boolean;
}

export class RepoIssuesApiError extends Error {
  status: number;
  /** The backend's own `error.code` (devtunnel-backend `lib/response.ts`), when the body parsed. */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "RepoIssuesApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseErrorBody(res: Response): Promise<{ code?: string; message?: string }> {
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    return { code: body.error?.code, message: body.error?.message };
  } catch {
    return {};
  }
}

/**
 * Fetches a repository's complete open-issue list from `path` (build it
 * with `repoIssuesPath`). Rejects with `RepoIssuesApiError` on any
 * non-2xx response — its `message` is the backend's own safe-to-show
 * text (e.g. "Couldn't reach GitHub right now"), never a raw HTTP detail
 * — and with a plain, user-readable `RepoIssuesApiError` (status `0`) when
 * the request never got an answer at all. An aborted request rethrows the
 * browser's own `AbortError` untouched so callers can tell "cancelled"
 * from "failed".
 */
export async function fetchAllRepoIssues<Row>(
  path: string,
  signal?: AbortSignal,
): Promise<RepoIssuesResult<Row>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { credentials: "include", signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new RepoIssuesApiError(
      "Couldn't reach DevTunnel. Check your connection and try again.",
      0,
    );
  }

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new RepoIssuesApiError(
      message ?? `Couldn't load issues right now (${res.status}).`,
      res.status,
      code,
    );
  }

  const body = (await res.json().catch(() => null)) as Partial<RepoIssuesResult<Row>> | null;
  if (!body || !Array.isArray(body.issues)) {
    throw new RepoIssuesApiError("Got an unexpected response while loading issues.", res.status);
  }

  return { issues: body.issues, truncated: body.truncated === true };
}