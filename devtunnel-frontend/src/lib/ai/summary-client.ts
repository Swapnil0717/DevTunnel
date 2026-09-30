// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as `./search-client.ts` and
// `lib/github-projects/catalog-client.ts`. Kept out of any server-only
// `api.ts` (those read request cookies via `next/headers`) so the detail
// pages stay as they were and the summary loads AFTER the page does.
import { API_BASE_URL } from "@/lib/config";

/** Which kind of page the summary is for — matches devtunnel-backend `SUMMARY_KINDS`. */
export type AiSummaryKind =
  | "devtunnel_project"
  | "devtunnel_tool"
  | "github_project"
  | "github_tool"
  | "community_project";

export type AiSetupDifficulty = "BEGINNER" | "INTERMEDIATE" | "ADVANCED";

/** Plain text only — the backend sanitises every field; the UI renders it as React text, never HTML. */
export interface AiSummaryData {
  /** At most two sentences. */
  tldr: string;
  whatItDoes: string;
  techStack: string[];
  goodFor: string[];
  /** `null` when the source didn't say enough to judge. */
  setupDifficulty: AiSetupDifficulty | null;
}

export interface AiSummaryResponse {
  kind: AiSummaryKind;
  key: string;
  summary: AiSummaryData;
  /** ISO time the summary text was generated. */
  generatedAt: string;
  /** `true` when the backend made no model call for this request. */
  cached: boolean;
}

export class AiSummaryError extends Error {
  status: number;
  /** The backend's own `error.code` (`unauthenticated`, `rate_limited`, `ai_disabled`, `not_enough_content`, `ai_unavailable`, …) when the body parsed. */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AiSummaryError";
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

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Checks the parts of the response the UI depends on; anything else is treated as a failed request rather than rendered blindly. */
function isAiSummaryResponse(value: unknown): value is AiSummaryResponse {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<AiSummaryResponse>;
  const summary = body.summary as Partial<AiSummaryData> | undefined;
  return (
    typeof body.generatedAt === "string" &&
    !!summary &&
    typeof summary.tldr === "string" &&
    typeof summary.whatItDoes === "string" &&
    isStringArray(summary.techStack) &&
    isStringArray(summary.goodFor) &&
    (summary.setupDifficulty === null ||
      summary.setupDifficulty === "BEGINNER" ||
      summary.setupDifficulty === "INTERMEDIATE" ||
      summary.setupDifficulty === "ADVANCED")
  );
}

/** Summaries already fetched in this tab, so flipping back to a page doesn't ask again. Memory only. */
const sessionCache = new Map<string, AiSummaryResponse>();

export function getCachedAiSummary(kind: AiSummaryKind, key: string): AiSummaryResponse | null {
  return sessionCache.get(`${kind}:${key}`) ?? null;
}

/**
 * Asks the backend for a page's AI summary (`POST /ai/summary`). The backend
 * returns the stored summary when there is one and only calls a model when
 * there isn't, so this is cheap to call on every visit.
 *
 * Rejects with `AiSummaryError` on any failure — its `message` is the
 * backend's own safe-to-show text where there is one — and rethrows the
 * browser's `AbortError` untouched so callers can tell "cancelled" from
 * "failed".
 */
export async function fetchAiSummary(
  kind: AiSummaryKind,
  key: string,
  signal?: AbortSignal,
): Promise<AiSummaryResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/ai/summary`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, key }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new AiSummaryError("Couldn't reach the server. Check your connection and try again.", 0);
  }

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new AiSummaryError(message ?? `The AI summary failed (${res.status})`, res.status, code);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AiSummaryError("The AI summary came back unreadable.", res.status);
  }
  if (!isAiSummaryResponse(body)) {
    throw new AiSummaryError("The AI summary came back in an unexpected shape.", res.status);
  }

  sessionCache.set(`${kind}:${key}`, body);
  return body;
}
