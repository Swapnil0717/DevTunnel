import { API_BASE_URL } from "@/lib/config";
import type {
  CreatedOpenSourceTool,
  OnboardingToolDescription,
  OnboardingToolLabels,
  ToolOnboardingDraft,
  ToolOnboardingValidationResult,
} from "./types";

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

/**
 * Step 4 (preview half) — `GET /admin/opensource-tools/onboarding/:id/preview`.
 *
 * Same convention as `fetchOnboardingPreview` in
 * `project-onboarding/api.ts`: re-fetches the full draft so what the
 * Admin reviews always reflects what's actually stored server-side,
 * rather than trusting whatever this component happened to accumulate
 * in local state across the last two steps.
 */
export async function fetchToolOnboardingPreview(draftId: string): Promise<ToolOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/opensource-tools/onboarding/${draftId}/preview`, {
    credentials: "include",
    cache: "no-store",
  });
  return parseDraftResponse(res, "load the tool preview");
}

/**
 * Step 4 (confirm half) — `POST /admin/opensource-tools/onboarding/:id/validate`.
 *
 * Same convention as `validateOnboarding` in `project-onboarding/api.ts`
 * — the frontend never decides for itself whether onboarding is
 * complete; this is the backend's authoritative check against
 * `urlCompleted`, `descriptionCompleted`, `labelsCompleted`,
 * `previewCompleted`.
 */
export async function validateToolOnboarding(
  draftId: string,
): Promise<ToolOnboardingValidationResult> {
  const res = await fetch(`${API_BASE_URL}/admin/opensource-tools/onboarding/${draftId}/validate`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    throw new ToolOnboardingApiError(`Failed to validate the draft (${res.status})`, res.status);
  }

  return (await res.json()) as ToolOnboardingValidationResult;
}

/**
 * `POST /admin/opensource-tools/onboarding/:id/complete`.
 *
 * Only reachable, per the same algorithm `project-onboarding/api.ts`
 * documents, once every mandatory step and final validation have
 * already passed — the backend rejects this call otherwise. On success
 * the draft stops existing as a draft; the response is the real,
 * now-listed catalog tool.
 */
export async function completeToolOnboarding(draftId: string): Promise<CreatedOpenSourceTool> {
  const res = await fetch(`${API_BASE_URL}/admin/opensource-tools/onboarding/${draftId}/complete`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    throw new ToolOnboardingApiError(`Failed to create the tool (${res.status})`, res.status);
  }

  return (await res.json()) as CreatedOpenSourceTool;
}