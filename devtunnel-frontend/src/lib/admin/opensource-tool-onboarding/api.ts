import { API_BASE_URL } from "@/lib/config";
import type { OnboardingToolDescription, ToolOnboardingDraft } from "./types";

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

/**
 * Step 2 — `PATCH /admin/opensource-tools/onboarding/:id/description`.
 *
 * Persists the Admin's choice between the description fetched from the
 * tool's URL and a custom one layered on top — same convention as
 * `saveDescription` in `project-onboarding/api.ts`. The fetched
 * description itself is never rewritten by this call; a custom
 * description is additional DevTunnel-only metadata, not an edit to
 * what was found at the source URL.
 */
export async function saveToolDescription(
  draftId: string,
  description: OnboardingToolDescription,
): Promise<ToolOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/opensource-tools/onboarding/${draftId}/description`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(description),
  });
  return parseDraftResponse(res, "save the tool description");
}

// Steps 3–4 (labels, preview/validation, complete) are added here as
// each step is built — see `OpenSourceToolOnboardingWizard`.