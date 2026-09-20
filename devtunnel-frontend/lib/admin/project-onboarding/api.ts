import { API_BASE_URL } from "@/lib/config";
import type {
  CreatedProject,
  OnboardingDescription,
  OnboardingTechStack,
  ProjectOnboardingDraft,
  ProjectOnboardingValidationResult,
} from "./types";

export class ProjectOnboardingApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ProjectOnboardingApiError";
    this.status = status;
  }
}

async function parseDraftResponse(res: Response, action: string): Promise<ProjectOnboardingDraft> {
  if (!res.ok) {
    throw new ProjectOnboardingApiError(`Failed to ${action} (${res.status})`, res.status);
  }
  return (await res.json()) as ProjectOnboardingDraft;
}

/**
 * Step 1 — `POST /admin/projects/onboarding/repository`
 * (admin_workflow.txt, "Step 1 — Import GitHub Repository" ▸ Backend).
 *
 * The Admin supplies only `repositoryUrl` — every other field on the
 * returned draft's `repository` (author, contributors, language, stars,
 * forks, issues, README, ...) is populated by the backend's own
 * "Parse → validate → check GitHub App access → fetch" algorithm, never
 * typed in here. Passing an existing `draftId` re-runs the import against
 * an in-progress draft (e.g. the Admin corrected a typo in the URL and
 * wants to re-fetch) instead of creating a second, orphaned draft.
 */
export async function importRepository(
  repositoryUrl: string,
  draftId?: string,
): Promise<ProjectOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/projects/onboarding/repository`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repositoryUrl, draftId }),
  });
  return parseDraftResponse(res, "import the repository");
}

/**
 * Step 2 — `PATCH /admin/projects/onboarding/:id/description`
 * ("Step 2 — Project Description" ▸ Backend). Persists the Admin's
 * choice between the existing README/description and a custom
 * DevTunnel-only description layered on top — never a rewrite of the
 * GitHub-sourced fields themselves ("Do not overwrite the GitHub
 * README.").
 */
export async function saveDescription(
  draftId: string,
  description: OnboardingDescription,
): Promise<ProjectOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/projects/onboarding/${draftId}/description`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(description),
  });
  return parseDraftResponse(res, "save the project description");
}

/**
 * Step 3 — `POST /admin/projects/onboarding/:id/tech-stack`
 * ("Step 3 — Project Tech Stack" ▸ Backend). Called once on step entry
 * with no body to trigger repository-analysis auto-detection, then again
 * with an edited `techStack` payload if the Admin reviews and corrects
 * the detected values ("the Admin should be able to review and correct
 * detected values... but the default values must come from repository
 * analysis").
 */
export async function detectTechStack(draftId: string): Promise<ProjectOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/projects/onboarding/${draftId}/tech-stack`, {
    method: "POST",
    credentials: "include",
  });
  return parseDraftResponse(res, "detect the project tech stack");
}

export async function saveTechStack(
  draftId: string,
  techStack: OnboardingTechStack,
): Promise<ProjectOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/projects/onboarding/${draftId}/tech-stack`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ techStack }),
  });
  return parseDraftResponse(res, "save the project tech stack");
}

/**
 * Step 4 — `GET /admin/projects/onboarding/:id/preview` ("Step 4 —
 * Project Preview" ▸ Backend). Re-fetches the full draft so the preview
 * always reflects whatever is actually stored server-side, rather than
 * trusting whatever this component happened to accumulate in local state
 * across the last three steps.
 */
export async function fetchOnboardingPreview(draftId: string): Promise<ProjectOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/projects/onboarding/${draftId}/preview`, {
    credentials: "include",
    cache: "no-store",
  });
  return parseDraftResponse(res, "load the project preview");
}

/**
 * Step 5 — `POST /admin/projects/onboarding/:id/validate` ("Step 5 —
 * Final Validation / Confirmation"). Per section 24, the frontend never
 * decides for itself whether onboarding is complete — this is the
 * backend's authoritative check against `repository_completed`,
 * `description_completed`, `tech_stack_completed`, `preview_completed`.
 */
export async function validateOnboarding(
  draftId: string,
): Promise<ProjectOnboardingValidationResult> {
  const res = await fetch(`${API_BASE_URL}/admin/projects/onboarding/${draftId}/validate`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    throw new ProjectOnboardingApiError(`Failed to validate the draft (${res.status})`, res.status);
  }

  return (await res.json()) as ProjectOnboardingValidationResult;
}

/**
 * `POST /admin/projects/onboarding/:id/complete` (section 7 — "Project
 * Creation Backend"). Only reachable, per the spec's algorithm, once
 * every mandatory step and final validation have already passed — the
 * backend rejects this call otherwise ("Everything valid? NO → Reject").
 * On success the draft stops existing as a draft; the response is the
 * real, now-ACTIVE project.
 */
export async function completeOnboarding(draftId: string): Promise<CreatedProject> {
  const res = await fetch(`${API_BASE_URL}/admin/projects/onboarding/${draftId}/complete`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) {
    throw new ProjectOnboardingApiError(`Failed to create the project (${res.status})`, res.status);
  }

  return (await res.json()) as CreatedProject;
}