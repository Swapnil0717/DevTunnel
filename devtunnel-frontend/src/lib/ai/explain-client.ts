// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as `./summary-client.ts`,
// `./search-client.ts` and `lib/github-projects/catalog-client.ts`. Kept out
// of any server-only `api.ts` (those read request cookies via
// `next/headers`) so the issue lists stay as they were and an explanation is
// only ever asked for when someone clicks "Explain".
import { API_BASE_URL } from "@/lib/config";

/** Which kind of page the click came from — matches devtunnel-backend `EXPLANATION_SOURCES`. */
export type AiExplainSource = "github" | "devtunnel";

export type AiExplainDifficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

/** Plain text only — the backend sanitises every field; the UI renders it as React text, never HTML. */
export interface AiIssueExplanationData {
  plainSummary: string;
  whatNeedsToBeDone: string[];
  skillsNeeded: string[];
  /** `null` when the issue didn't say enough to judge. */
  difficulty: AiExplainDifficulty | null;
  firstSteps: string[];
  caveats: string[];
}

export interface AiIssueExplanationResponse {
  source: AiExplainSource;
  repo: string;
  issueNumber: number;
  explanation: AiIssueExplanationData;
  /** ISO time the explanation text was generated. */
  generatedAt: string;
  /** `true` when the backend made no model call for this request. */
  cached: boolean;
}

export class AiExplainError extends Error {
  status: number;
  /** The backend's own `error.code` (`unauthenticated`, `rate_limited`, `ai_disabled`, `not_enough_content`, `issue_closed`, `not_found`, `ai_unavailable`, …) when the body parsed. */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AiExplainError";
    this.status = status;
    this.code = code;
  }
}

/**
 * `owner/repo` out of a GitHub repository URL (`https://github.com/owner/repo`,
 * with or without a trailing slash, `.git` or extra path). `null` for anything
 * that isn't a github.com repository — the caller then simply doesn't show
 * an Explain button rather than sending a request that can only fail.
 */
export function parseGithubRepoFullName(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!/(^|\.)github\.com$/i.test(parsed.hostname)) return null;
    const [owner, repo] = parsed.pathname.split("/").filter(Boolean);
    if (!owner || !repo) return null;
    const name = `${owner}/${repo.replace(/\.git$/i, "")}`;
    return /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(name) ? name : null;
  } catch {
    return null;
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Checks the parts of the response the UI depends on; anything else is treated as a failed request rather than rendered blindly. */
function isAiIssueExplanationResponse(value: unknown): value is AiIssueExplanationResponse {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<AiIssueExplanationResponse>;
  const e = body.explanation as Partial<AiIssueExplanationData> | undefined;
  return (
    typeof body.generatedAt === "string" &&
    !!e &&
    typeof e.plainSummary === "string" &&
    isStringArray(e.whatNeedsToBeDone) &&
    isStringArray(e.skillsNeeded) &&
    isStringArray(e.firstSteps) &&
    isStringArray(e.caveats) &&
    (e.difficulty === null || e.difficulty === "BEGINNER" || e.difficulty === "INTERMEDIATE" || e.difficulty === "ADVANCED")
  );
}

/** Explanations already fetched in this tab, so re-opening a panel doesn't ask again. Memory only. */
const sessionCache = new Map<string, AiIssueExplanationResponse>();

function cacheKey(source: AiExplainSource, repo: string, issueNumber: number): string {
  return `${source}:${repo.toLowerCase()}#${issueNumber}`;
}

export function getCachedAiExplanation(source: AiExplainSource, repo: string, issueNumber: number): AiIssueExplanationResponse | null {
  return sessionCache.get(cacheKey(source, repo, issueNumber)) ?? null;
}

/**
 * Asks the backend to explain one issue (`POST /ai/issue-explanation`). The
 * backend returns the stored explanation when there is one and only calls a
 * model when there isn't, so this is cheap to call on every click.
 *
 * Rejects with `AiExplainError` on any failure — its `message` is the
 * backend's own safe-to-show text where there is one — and rethrows the
 * browser's `AbortError` untouched so callers can tell "cancelled" from
 * "failed".
 */
export async function fetchAiIssueExplanation(
  source: AiExplainSource,
  repo: string,
  issueNumber: number,
  signal?: AbortSignal,
): Promise<AiIssueExplanationResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/ai/issue-explanation`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source, repo, issueNumber }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new AiExplainError("Couldn't reach the server. Check your connection and try again.", 0);
  }

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new AiExplainError(message ?? `The AI explanation failed (${res.status})`, res.status, code);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AiExplainError("The AI explanation came back unreadable.", res.status);
  }
  if (!isAiIssueExplanationResponse(body)) {
    throw new AiExplainError("The AI explanation came back in an unexpected shape.", res.status);
  }

  sessionCache.set(cacheKey(source, repo, issueNumber), body);
  return body;
}
