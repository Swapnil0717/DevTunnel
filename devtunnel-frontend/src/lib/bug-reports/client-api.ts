// Browser-only — calls the API directly (`credentials: "include"`, so a
// signed-in reporter is linked to their account), same convention as
// `lib/tasks/client-api.ts`.
import { API_BASE_URL } from "@/lib/config";

export const BUG_AREAS = [
  { value: "projects", label: "Projects" },
  { value: "tasks", label: "Tasks and issues" },
  { value: "cli", label: "CLI" },
  { value: "profile", label: "Profile and settings" },
  { value: "other", label: "Other" },
] as const;

export const BUG_SEVERITIES = [
  { value: "minor", label: "Small annoyance" },
  { value: "broken", label: "Something is broken" },
  { value: "blocked", label: "I can't continue" },
] as const;

export type BugAreaValue = (typeof BUG_AREAS)[number]["value"];
export type BugSeverityValue = (typeof BUG_SEVERITIES)[number]["value"];

/** Same limits as the backend (`src/routes/bugReports.ts`) and the table checks (sql/050). */
export const BUG_LIMITS = {
  titleMin: 3,
  titleMax: 120,
  descriptionMin: 10,
  descriptionMax: 2000,
  stepsMax: 2000,
  expectedMax: 500,
} as const;

export interface BugReportInput {
  title: string;
  area: BugAreaValue;
  severity: BugSeverityValue;
  description: string;
  steps: string;
  expected: string;
  /** Path of the page the reporter was on, added by the popup. */
  pageUrl: string;
}

export type SubmitBugReportResult = { ok: true } | { ok: false; message: string };

/**
 * `POST /bug-reports` (devtunnel-backend src/routes/bugReports.ts).
 *
 * A deliberate user action, so the caller needs a reason on failure: this
 * resolves `{ ok: true }` when saved and `{ ok: false, message }` otherwise,
 * and never throws. A 400 carries the backend's own validation sentence; every
 * other failure (offline, rate-limited, server error) gets one generic line.
 */
export async function submitBugReport(input: BugReportInput): Promise<SubmitBugReportResult> {
  try {
    const res = await fetch(`${API_BASE_URL}/bug-reports`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: input.title.trim(),
        area: input.area,
        severity: input.severity,
        description: input.description.trim(),
        steps: input.steps.trim() || null,
        expected: input.expected.trim() || null,
        pageUrl: input.pageUrl || null,
      }),
    });
    if (res.ok) return { ok: true };

    if (res.status === 400) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      const message = body?.error?.message;
      if (message) return { ok: false, message };
    }
    if (res.status === 429) {
      return { ok: false, message: "Too many reports in a short time. Try again in a minute." };
    }
    return { ok: false, message: "Couldn't send your report. Check your connection and try again." };
  } catch {
    return { ok: false, message: "Couldn't send your report. Check your connection and try again." };
  }
}
