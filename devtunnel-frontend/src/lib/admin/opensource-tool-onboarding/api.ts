import { API_BASE_URL } from "@/lib/config";
import type { ToolOnboardingDraft } from "./types";

export class ToolOnboardingApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ToolOnboardingApiError";
    this.status = status;
  }
}

async function parseDraftResponse(res: Response, action: string): Promise<ToolOnboardingDraft> {
  if (!res.ok) {
    throw new ToolOnboardingApiError(`Failed to ${action} (${res.status})`, res.status);
  }
  return (await res.json()) as ToolOnboardingDraft;
}

/**
 * Step 1 — `POST /admin/opensource-tools/onboarding/url`.
 *
 * The Admin supplies only `url` — everything else on the returned
 * draft's `source` (name, description, README, language) is resolved by
 * the backend, never typed in here. Passing an existing `draftId`
 * re-runs the fetch against an in-progress draft (e.g. the Admin
 * corrected a typo in the URL) instead of creating a second, orphaned
 * draft — same convention as `importRepository` in
 * `project-onboarding/api.ts`.
 */
export async function importToolUrl(
  url: string,
  draftId?: string,
): Promise<ToolOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/opensource-tools/onboarding/url`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, draftId }),
  });
  return parseDraftResponse(res, "import the tool URL");
}

// Steps 2–4 (description, labels, preview/validation, complete) are added
// here as each step is built — see `OpenSourceToolOnboardingWizard`.