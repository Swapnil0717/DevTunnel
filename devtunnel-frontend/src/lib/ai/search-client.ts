// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as
// `lib/github-projects/catalog-client.ts` and `client-api.ts`. Kept out of
// any server-only `api.ts` (those read request cookies via `next/headers`).
import { API_BASE_URL } from "@/lib/config";
import type { GithubProjectSummary } from "@/lib/github-projects/types";

/**
 * What the model understood the request to mean — echoed back so the UI can
 * show "Looking for: …" chips. Plain text only: the backend sanitises every
 * field, and the UI renders it as text (never as HTML).
 */
export interface AiSearchInterpretation {
  keywords: string[];
  techStack: string[];
  languages: string[];
  intent: string;
}

/**
 * Response of every `POST …/ai-search` endpoint:
 *  - `/github-projects` and `/github-open-source-tools` (Part 2,
 *    devtunnel-backend `lib/githubCatalogAiSearch.ts`) — rows are
 *    `GithubProjectSummary` (the default);
 *  - `/projects` (`ProjectSummary`) and `/opensource-tools`
 *    (`OpenSourceToolSummary`) (Part 3, `lib/devtunnelAiSearch.ts`).
 * `aiUsed: false` is an honest keyword-only fallback — the backend could not
 * reach a model, or its answer was unusable — never a faked AI result.
 *
 * `Row` is whatever the matching list endpoint returns; the client only
 * checks that `results` is an array, so callers must pass the row type that
 * belongs to the path they call.
 */
export interface AiSearchResult<Row = GithubProjectSummary> {
  /** Same row shape the list endpoint returns, ranked best match first. */
  results: Row[];
  interpretation: AiSearchInterpretation;
  aiUsed: boolean;
  fallbackReason?: "unavailable" | "unusable_answer";
  /** How many catalog rows were ranked. */
  scanned: number;
}

export class AiSearchError extends Error {
  status: number;
  /** The backend's own `error.code` (`unauthenticated`, `rate_limited`, `ai_disabled`, `catalog_warming`, …) when the body parsed. */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AiSearchError";
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
function isAiSearchResult<Row>(value: unknown): value is AiSearchResult<Row> {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<AiSearchResult<Row>>;
  const interpretation = body.interpretation as Partial<AiSearchInterpretation> | undefined;
  return (
    Array.isArray(body.results) &&
    typeof body.aiUsed === "boolean" &&
    !!interpretation &&
    isStringArray(interpretation.keywords) &&
    isStringArray(interpretation.techStack) &&
    isStringArray(interpretation.languages) &&
    typeof interpretation.intent === "string"
  );
}

/**
 * Runs an AI search against one list. `path` is that list's backend route
 * (`"/github-projects"`, `"/github-open-source-tools"`, `"/projects"` or
 * `"/opensource-tools"`); `/ai-search` is appended.
 *
 * Rejects with `AiSearchError` on any failure — its `message` is the
 * backend's own safe-to-show text where there is one — and rethrows the
 * browser's `AbortError` untouched so callers can tell "cancelled" from
 * "failed".
 */
export async function runAiCatalogSearch<Row = GithubProjectSummary>(
  path: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<AiSearchResult<Row>> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}/ai-search`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new AiSearchError("Couldn't reach the server. Check your connection and try again.", 0);
  }

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new AiSearchError(message ?? `AI search failed (${res.status})`, res.status, code);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AiSearchError("AI search returned an unreadable response.", res.status);
  }
  if (!isAiSearchResult<Row>(body)) {
    throw new AiSearchError("AI search returned an unexpected response.", res.status);
  }
  return body;
}
