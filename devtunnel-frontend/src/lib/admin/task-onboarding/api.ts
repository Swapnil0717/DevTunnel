import { API_BASE_URL } from "@/lib/config";
import type { OnboardingTechStack } from "@/lib/admin/project-onboarding/types";
import type {
  CreatedTask,
  GithubIssueSummary,
  TaskCuration,
  TaskIssueInformation,
  TaskOnboardingDraft,
  TaskOnboardingProjectOption,
  TaskOnboardingValidationResult,
} from "./types";

export class TaskOnboardingApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "TaskOnboardingApiError";
    this.status = status;
  }
}

async function parseDraftResponse(res: Response, action: string): Promise<TaskOnboardingDraft> {
  if (!res.ok) {
    throw new TaskOnboardingApiError(`Failed to ${action} (${res.status})`, res.status);
  }
  return (await res.json()) as TaskOnboardingDraft;
}

/**
 * Step 1 — `GET /admin/tasks/onboarding/projects`
 * (admin_workflow.txt, "Step 1 — Project Selection" ▸ Backend).
 *
 * "Only active/eligible DevTunnel projects should be selectable" — this
 * list is exactly what the backend considers eligible; the frontend
 * never filters a broader project list down to "eligible" on its own.
 */
export async function fetchOnboardingProjects(): Promise<TaskOnboardingProjectOption[]> {
  const res = await fetch(`${API_BASE_URL}/admin/tasks/onboarding/projects`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new TaskOnboardingApiError(`Failed to load projects (${res.status})`, res.status);
  }
  return (await res.json()) as TaskOnboardingProjectOption[];
}

/**
 * Step 1 — `POST /admin/tasks/onboarding` (section 22 ▸ "Task
 * onboarding"). Creates the draft the moment a project is picked, or
 * re-runs the selection against an in-progress draft if the Admin comes
 * back and picks a different project — same "pass an existing draftId to
 * update instead of orphaning a second draft" convention as
 * `importRepository` in the Project Onboarding API.
 */
export async function selectOnboardingProject(
  projectId: string,
  draftId?: string,
): Promise<TaskOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/tasks/onboarding`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, draftId }),
  });
  return parseDraftResponse(res, "select the project");
}

/**
 * Step 2 — `GET /admin/projects/:id/github/issues` (section 22 ▸
 * "Task onboarding"; "Step 2 — Select Existing Issue" ▸ Backend).
 *
 * Per the Step 2 algorithm ("Remove irrelevant/unsupported issues"), the
 * backend is responsible for pre-filtering what comes back — this
 * frontend renders the list exactly as returned rather than applying its
 * own relevance rules.
 */
export async function fetchProjectIssues(projectId: string): Promise<GithubIssueSummary[]> {
  const res = await fetch(`${API_BASE_URL}/admin/projects/${projectId}/github/issues`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new TaskOnboardingApiError(`Failed to load issues (${res.status})`, res.status);
  }
  return (await res.json()) as GithubIssueSummary[];
}

/**
 * Step 2 — `PATCH /admin/tasks/onboarding/:id/issue`. Persists the
 * Admin's chosen GitHub issue number onto the draft, which is what marks
 * `steps.issueSelected` true server-side. The Admin never types an issue
 * number by hand — this only ever receives a number that came back from
 * `fetchProjectIssues` ("The Admin should not need to manually type an
 * issue number if it already exists on GitHub").
 */
export async function selectIssue(
  draftId: string,
  issueNumber: number,
): Promise<TaskOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/tasks/onboarding/${draftId}/issue`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ issueNumber }),
  });
  return parseDraftResponse(res, "select the issue");
}

/**
 * Step 3 — `PATCH /admin/tasks/onboarding/:id/issue-information`
 * ("Step 3 — Issue Information" ▸ the spec's two choices). Never rewrites
 * the original GitHub issue — "The custom information belongs to
 * DevTunnel."
 */
export async function saveIssueInformation(
  draftId: string,
  issueInformation: TaskIssueInformation,
): Promise<TaskOnboardingDraft> {
  const res = await fetch(
    `${API_BASE_URL}/admin/tasks/onboarding/${draftId}/issue-information`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(issueInformation),
    },
  );
  return parseDraftResponse(res, "save the issue information");
}

/**
 * Step 4 — `GET /admin/projects/:id/tech-stack` (section 22 ▸ "Task
 * onboarding"; "Step 4 — Fetch Project Tech Stack" ▸ Backend). Reads the
 * project's already-validated tech stack from Project Onboarding rather
 * than triggering a second repository analysis — the algorithm is
 * literally "Task Project → Project ID → Project Tech Stack → Attach to
 * Task Onboarding", so this call is immediately followed by
 * `attachTechStack` below to persist that attachment on the draft.
 */
export async function fetchProjectTechStack(projectId: string): Promise<OnboardingTechStack> {
  const res = await fetch(`${API_BASE_URL}/admin/projects/${projectId}/tech-stack`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new TaskOnboardingApiError(
      `Failed to load the project tech stack (${res.status})`,
      res.status,
    );
  }
  return (await res.json()) as OnboardingTechStack;
}

/**
 * Step 4 (continued) — `PATCH /admin/tasks/onboarding/:id/tech-stack`.
 * Marks `steps.techStackLoaded` true once the project's tech stack has
 * been attached to this draft. Read-only from the Admin's point of view
 * on this screen — there is no separate "edit" call here, unlike Project
 * Onboarding's Step 3, because re-detecting a project's stack is out of
 * scope for Task Onboarding.
 */
export async function attachTechStack(draftId: string): Promise<TaskOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/tasks/onboarding/${draftId}/tech-stack`, {
    method: "PATCH",
    credentials: "include",
  });
  return parseDraftResponse(res, "attach the project tech stack");
}

/**
 * Step 5 — `PATCH /admin/tasks/onboarding/:id/difficulty` (given
 * verbatim in admin_workflow.txt, "Step 5 — Difficulty" ▸ Backend).
 * Carries `role` alongside `difficulty` in the same payload — both are
 * curation fields the Admin sets together on the same screen, and
 * splitting them into two round trips would only mean two chances for
 * the draft to end up half-saved.
 */
export async function saveCuration(
  draftId: string,
  curation: TaskCuration,
): Promise<TaskOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/tasks/onboarding/${draftId}/difficulty`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(curation),
  });
  return parseDraftResponse(res, "save the role and difficulty");
}

/**
 * Step 6 — `GET /admin/tasks/onboarding/:id/preview` (given verbatim in
 * section 22). Re-fetches the full draft so the preview always reflects
 * what's actually stored server-side, never accumulated local state —
 * same convention as Project Onboarding's `fetchOnboardingPreview`.
 */
export async function fetchTaskOnboardingPreview(draftId: string): Promise<TaskOnboardingDraft> {
  const res = await fetch(`${API_BASE_URL}/admin/tasks/onboarding/${draftId}/preview`, {
    credentials: "include",
    cache: "no-store",
  });
  return parseDraftResponse(res, "load the task preview");
}

/**
 * Final Validation — `POST /admin/tasks/onboarding/:id/validate` (given
 * verbatim in section 22). Per section 25, the frontend never decides
 * for itself whether onboarding is complete — this is the backend's
 * authoritative check against every `TaskOnboardingStepState` flag.
 */
export async function validateTaskOnboarding(
  draftId: string,
): Promise<TaskOnboardingValidationResult> {
  const res = await fetch(`${API_BASE_URL}/admin/tasks/onboarding/${draftId}/validate`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    throw new TaskOnboardingApiError(`Failed to validate the draft (${res.status})`, res.status);
  }
  return (await res.json()) as TaskOnboardingValidationResult;
}

/**
 * `POST /admin/tasks/onboarding/:id/complete` (given verbatim in section
 * 22; section 12 — "Task Creation Algorithm"). Only reachable once every
 * mandatory step and final validation have already passed — the backend
 * rejects this call otherwise. On success the draft stops existing as a
 * draft; the response is the real DevTunnel task, now available to
 * contributors ("Task becomes available").
 */
export async function completeTaskOnboarding(draftId: string): Promise<CreatedTask> {
  const res = await fetch(`${API_BASE_URL}/admin/tasks/onboarding/${draftId}/complete`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    throw new TaskOnboardingApiError(`Failed to create the task (${res.status})`, res.status);
  }
  return (await res.json()) as CreatedTask;
}