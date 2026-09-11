/**
 * Local, frontend-only shape for the Admin **Task Onboarding** wizard
 * (admin_workflow.txt, section 10 — "Create Task — Task Onboarding" and
 * section 25 — "Task Onboarding State").
 *
 * Same convention as `lib/admin/project-onboarding/types.ts`: this mirrors
 * an onboarding-draft model, not a final `Task` row — "Only when all
 * required states are valid: Create DevTunnel Task." Every field here is
 * either GitHub-sourced (via the selected project's repository), backend
 * -derived, or something the Admin explicitly chose — never invented by
 * this frontend (Frontend_Development_Rules.txt rule 58/59). The backend
 * isn't part of this deliverable, so the request/response shapes below
 * are a documented assumption built directly from admin_workflow.txt
 * section 22 ("Admin Backend API Map" ▸ "Task onboarding"), not from an
 * existing schema file.
 */

 import type {
  OnboardingGithubIdentity,
  OnboardingTechStack,
} from "@/lib/admin/project-onboarding/types";
import type { DeveloperRole, ExperienceLevel } from "@/lib/onboarding/types";

/**
 * Step 1 — "Project Selection". Only active/eligible DevTunnel projects
 * are selectable ("Only active/eligible DevTunnel projects should be
 * selectable"), so this is deliberately a small, list-friendly shape —
 * not the full `AdminProjectSummary` table row.
 */
export interface TaskOnboardingProjectOption {
  id: string;
  slug: string;
  name: string;
  repositoryFullName: string;
  primaryLanguage: string | null;
}

/**
 * Step 2 — "Select Existing Issue". Fields match the spec's Frontend
 * list exactly: "Issue #, Issue Title, Issue State, Labels, Created,
 * Updated" — plus the body/author/comment-count Step 3 needs once an
 * issue is actually picked, so this one shape covers both the
 * selectable-list rendering and the fetched-detail rendering without a
 * second, near-duplicate type.
 */
export type GithubIssueState = "OPEN" | "CLOSED";

export interface GithubIssueSummary {
  number: number;
  title: string;
  state: GithubIssueState;
  url: string;
  labels: string[];
  author: OnboardingGithubIdentity;
  /** Full issue body/description exactly as written on GitHub. */
  body: string | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Step 3 — "Issue Information". The spec's exact two choices: use the
 * fetched GitHub issue information as-is, or keep it and layer a
 * DevTunnel-only custom description on top. "Do not modify the original
 * GitHub issue" — `customDescription` is DevTunnel task metadata, never
 * a rewrite of `GithubIssueSummary.body`.
 */
export type IssueInformationChoice = "EXISTING" | "CUSTOM";

export interface TaskIssueInformation {
  choice: IssueInformationChoice;
  /** Only meaningful when `choice === "CUSTOM"`. */
  customDescription: string | null;
}

export const DEFAULT_ISSUE_INFORMATION: TaskIssueInformation = {
  choice: "EXISTING",
  customDescription: null,
};

/**
 * Step 5 — "Difficulty", plus the target contributor role(s) this task
 * is curated for. The spec only names Difficulty explicitly, but the
 * DevTunnel home feed already models a task's role (see
 * `lib/home/types.ts`'s `RecommendedTask.role`, e.g. "Backend
 * Developer") — so `roles` here reuses the same `DeveloperRole` enum the
 * contributor onboarding flow already defines
 * (`lib/onboarding/types.ts`) rather than inventing a second taxonomy
 * for what is the same underlying concept. Multi-select — a task can be
 * relevant to more than one role at once (e.g. Frontend + Docs), same
 * convention as `lib/admin/tasks/types.ts` `AdminTaskSummary.roles`.
 */
export interface TaskCuration {
  roles: DeveloperRole[];
  difficulty: ExperienceLevel | null;
}

export const EMPTY_TASK_CURATION: TaskCuration = {
  roles: [],
  difficulty: null,
};

/**
 * Backend-authoritative completion flags (section 25 — "Task Onboarding
 * State"). Field names follow the spec's own list verbatim:
 * project_selected, issue_selected, issue_information_completed,
 * tech_stack_loaded, difficulty_defined, preview_completed,
 * validation_completed. The wizard reads these from every draft response
 * to decide what it's allowed to do next — never a locally-computed
 * guess (same rule the Project Onboarding wizard follows).
 */
export interface TaskOnboardingStepState {
  projectSelected: boolean;
  issueSelected: boolean;
  issueInformationCompleted: boolean;
  techStackLoaded: boolean;
  difficultyDefined: boolean;
  previewCompleted: boolean;
  validationCompleted: boolean;
}

export const EMPTY_TASK_STEP_STATE: TaskOnboardingStepState = {
  projectSelected: false,
  issueSelected: false,
  issueInformationCompleted: false,
  techStackLoaded: false,
  difficultyDefined: false,
  previewCompleted: false,
  validationCompleted: false,
};

/**
 * The task onboarding draft as a whole. `id` is assigned by the backend
 * the moment Step 1 succeeds (project selected), then threaded through
 * every later request. `techStack` is attached read-only from the
 * project's own already-validated tech stack — section "Step 4 — Fetch
 * Project Tech Stack": "Do not re-analyze the repository unnecessarily
 * if the project already has a validated tech stack from Project
 * Onboarding."
 */
export interface TaskOnboardingDraft {
  id: string;
  project: TaskOnboardingProjectOption | null;
  issue: GithubIssueSummary | null;
  issueInformation: TaskIssueInformation | null;
  curation: TaskCuration | null;
  techStack: OnboardingTechStack | null;
  steps: TaskOnboardingStepState;
}

/** A single unmet-requirement message from `POST .../:id/validate`. */
export interface TaskOnboardingValidationIssue {
  step: keyof TaskOnboardingStepState;
  message: string;
}

export interface TaskOnboardingValidationResult {
  valid: boolean;
  issues: TaskOnboardingValidationIssue[];
}

/** Result of `POST /admin/tasks/onboarding/:id/complete`. */
export interface CreatedTask {
  id: string;
  slug: string;
  title: string;
  projectSlug: string;
}