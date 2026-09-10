import { API_BASE_URL } from "@/lib/config";
import type { OnboardingToolDescription, OnboardingToolLabels, ToolOnboardingDraft } from "./types";

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

/**
 * Step 3 — `PATCH /admin/opensource-tools/onboarding/:id/labels`.
 *
 * Persists the free-form audience labels (roles, fields, etc.) an Admin
 * attaches to the tool — same "whatever the Admin typed, verbatim" rule
 * as the rest of this flow. Nothing here is inferred from the fetched
 * README or description; the Admin chooses every label explicitly.
 */
export async function saveToolLabels(
  draftId: string,
  labels: OnboardingToolLabels,
): Promise<ToolOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/opensource-tools/onboarding/${draftId}/labels`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(labels),
  });
  return parseDraftResponse(res, "save the tool labels");
}

// Step 4 (preview/validation, complete) is added here once it's built —
// see `OpenSourceToolOnboardingWizard`.