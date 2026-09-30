// Browser-only — calls the API directly with the session cookie
// (`credentials: "include"`), same convention as `./explain-client.ts`,
// `./summary-client.ts` and `lib/github-projects/catalog-client.ts`. Kept out
// of any server-only `api.ts` (those read request cookies via
// `next/headers`) so the issue lists stay as they were and insights are only
// ever asked for when someone presses "Analyze issues".
import { API_BASE_URL } from "@/lib/config";
import type { DeveloperRole, ExperienceLevel } from "@/lib/onboarding/types";

/** One analysed issue. Plain text only — the backend sanitises every field; the UI renders it as React text, never HTML. */
export interface AiInsightIssue {
  number: number;
  role: DeveloperRole;
  level: ExperienceLevel;
  techStack: string[];
  /** `""` when the model's line was unusable — render nothing then. */
  oneLine: string;
}

export interface AiIssueInsightsData {
  overview: string;
  byRole: Partial<Record<DeveloperRole, number>>;
  byLevel: Partial<Record<ExperienceLevel, number>>;
  topTechStack: { name: string; count: number }[];
  bestFor: { roles: DeveloperRole[]; levels: ExperienceLevel[]; techStack: string[] };
  issues: AiInsightIssue[];
}

export interface AiIssueInsightsResponse {
  /** Lower-cased `owner/repo`. */
  repo: string;
  insights: AiIssueInsightsData;
  analyzedIssueCount: number;
  /** ISO time the insights were generated. */
  generatedAt: string;
  /** `true` when the backend made no model call for this request. */
  cached: boolean;
}

export class AiInsightsError extends Error {
  status: number;
  /** The backend's own `error.code` (`unauthenticated`, `rate_limited`, `ai_disabled`, `no_issues`, `not_found`, `ai_unavailable`, …) when the body parsed. */
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "AiInsightsError";
    this.status = status;
    this.code = code;
  }
}

const ROLES: readonly string[] = ["FRONTEND", "BACKEND", "FULL_STACK", "DOCUMENTATION", "TESTING", "DEVOPS"];
const LEVELS: readonly string[] = ["BEGINNER", "INTERMEDIATE", "ADVANCED"];

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

function isCountRecord(value: unknown, allowedKeys: readonly string[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, count]) => allowedKeys.includes(key) && typeof count === "number" && Number.isFinite(count) && count >= 0);
}

function isInsightIssue(value: unknown): value is AiInsightIssue {
  if (!value || typeof value !== "object") return false;
  const issue = value as Partial<AiInsightIssue>;
  return (
    typeof issue.number === "number" &&
    typeof issue.role === "string" &&
    ROLES.includes(issue.role) &&
    typeof issue.level === "string" &&
    LEVELS.includes(issue.level) &&
    isStringArray(issue.techStack) &&
    typeof issue.oneLine === "string"
  );
}

/** Checks the parts of the response the UI depends on; anything else is treated as a failed request rather than rendered blindly. */
function isAiIssueInsightsResponse(value: unknown): value is AiIssueInsightsResponse {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<AiIssueInsightsResponse>;
  const i = body.insights as Partial<AiIssueInsightsData> | undefined;
  return (
    typeof body.generatedAt === "string" &&
    typeof body.analyzedIssueCount === "number" &&
    !!i &&
    typeof i.overview === "string" &&
    isCountRecord(i.byRole, ROLES) &&
    isCountRecord(i.byLevel, LEVELS) &&
    Array.isArray(i.topTechStack) &&
    i.topTechStack.every((t) => !!t && typeof t.name === "string" && typeof t.count === "number") &&
    !!i.bestFor &&
    isStringArray(i.bestFor.roles) &&
    isStringArray(i.bestFor.levels) &&
    isStringArray(i.bestFor.techStack) &&
    Array.isArray(i.issues) &&
    i.issues.every(isInsightIssue)
  );
}

/** Insights already fetched in this tab, so switching tabs and back doesn't ask again. Memory only. */
const sessionCache = new Map<string, AiIssueInsightsResponse>();

function cacheKey(repo: string): string {
  return repo.toLowerCase();
}

export function getCachedAiInsights(repo: string): AiIssueInsightsResponse | null {
  return sessionCache.get(cacheKey(repo)) ?? null;
}

/**
 * Asks the backend to analyse one repository's open issues
 * (`POST /ai/issue-insights`). The backend returns the stored insights when
 * there are any and only calls a model when there aren't (or the issue list
 * changed and the stored ones are old), so this is cheap to call again.
 *
 * Rejects with `AiInsightsError` on any failure — its `message` is the
 * backend's own safe-to-show text where there is one — and rethrows the
 * browser's `AbortError` untouched so callers can tell "cancelled" from
 * "failed".
 */
export async function fetchAiIssueInsights(repo: string, signal?: AbortSignal): Promise<AiIssueInsightsResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/ai/issue-insights`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo }),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new AiInsightsError("Couldn't reach the server. Check your connection and try again.", 0);
  }

  if (!res.ok) {
    const { code, message } = await parseErrorBody(res);
    throw new AiInsightsError(message ?? `The AI analysis failed (${res.status})`, res.status, code);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new AiInsightsError("The AI analysis came back unreadable.", res.status);
  }
  if (!isAiIssueInsightsResponse(body)) {
    throw new AiInsightsError("The AI analysis came back in an unexpected shape.", res.status);
  }

  sessionCache.set(cacheKey(repo), body);
  return body;
}
