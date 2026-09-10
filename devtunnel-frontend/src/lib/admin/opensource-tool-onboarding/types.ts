/**
 * Local, frontend-only shape for the Admin **Open Source Tool Onboarding**
 * wizard — `/admin/opensource-tools/new` ("Add Open Source Tool" in
 * `admin-nav-items.ts`).
 *
 * There's no Admin Portal Master Coding Specification module for this
 * flow (it isn't in admin_workflow.txt), so this follows the same shape
 * and conventions as `lib/admin/project-onboarding/types.ts` — a draft
 * that lives only in onboarding state until every step is completed, not
 * a published catalog row from step one. Same "never invent it" rule
 * applies (Frontend_Development_Rules.txt rule 58/59): every field here
 * is either fetched from the tool's URL by the backend or explicitly
 * chosen by the Admin, never guessed by this frontend.
 *
 * The backend routes this assumes (`POST /admin/opensource-tools/onboarding/url`,
 * etc.) don't exist yet — same documented-assumption convention as
 * `project-onboarding/types.ts` uses for its own endpoints.
 */

/**
 * Step 1 result — "Tool URL". The Admin supplies only the project's URL;
 * everything else here comes back from whatever the backend can resolve
 * from it (GitHub repo metadata when the URL is a GitHub repository, or a
 * best-effort name/description otherwise). No field here has a writable
 * counterpart the Admin fills in by hand.
 */
 export interface OnboardingToolSource {
  url: string;
  name: string;
  /** Short description exactly as fetched (GitHub repo description, site meta description, ...), or `null` if none was found. */
  fetchedDescription: string | null;
  /** Full README/long-form content if the URL resolved to a GitHub repository, else `null`. */
  readme: string | null;
  primaryLanguage: string | null;
}

/**
 * Step 2 — "Description". Same two-choice shape as project onboarding:
 * use what was fetched as-is, or keep it and layer a DevTunnel-specific
 * description on top. Never a rewrite of the fetched description itself.
 */
export type ToolDescriptionChoice = "EXISTING" | "CUSTOM";

export interface OnboardingToolDescription {
  choice: ToolDescriptionChoice;
  /** Only meaningful when `choice === "CUSTOM"`. */
  customDescription: string | null;
}

/**
 * Step 3 — "Labels". Free-form tags describing who benefits from this
 * tool — roles (e.g. "Backend developer"), fields (e.g. "DevOps",
 * "Data science"), or any other audience label an Admin adds. Kept as a
 * flat string list rather than a fixed enum since the set of relevant
 * roles/fields isn't closed.
 */
export interface OnboardingToolLabels {
  values: string[];
}

/**
 * Step 4 — "Setup & Usage". Free-form Markdown the Admin writes by
 * hand describing how a contributor installs, configures and runs the
 * tool. Unlike Steps 1–3, nothing here is fetched — a repository's
 * README documents the *project*, not necessarily "how do I get this
 * running and use it today", so this is deliberately a separate,
 * always-editable field rather than a derivation of `source.readme`.
 * Rendered through `MarkdownReadme` everywhere it's shown, same as any
 * other Markdown in this app (rule 20 — never `dangerouslySetInnerHTML`).
 */
export interface OnboardingToolSetupGuide {
  /** Markdown source. Empty string until the Admin writes something. */
  content: string;
}

/**
 * Backend-authoritative completion flags, same convention as
 * `ProjectOnboardingStepState` (project-onboarding/types.ts) — the
 * wizard reads these from the draft response rather than deciding for
 * itself whether a step is "done".
 */
export interface ToolOnboardingStepState {
  urlCompleted: boolean;
  descriptionCompleted: boolean;
  labelsCompleted: boolean;
  setupGuideCompleted: boolean;
  previewCompleted: boolean;
}

export const EMPTY_TOOL_STEP_STATE: ToolOnboardingStepState = {
  urlCompleted: false,
  descriptionCompleted: false,
  labelsCompleted: false,
  setupGuideCompleted: false,
  previewCompleted: false,
};

/**
 * The onboarding draft as a whole. `id` is assigned by the backend the
 * moment Step 1 succeeds, then threaded through every later request.
 */
export interface ToolOnboardingDraft {
  id: string;
  source: OnboardingToolSource | null;
  description: OnboardingToolDescription | null;
  labels: OnboardingToolLabels | null;
  setupGuide: OnboardingToolSetupGuide | null;
  steps: ToolOnboardingStepState;
}

/** A single unmet-requirement message from final validation. */
export interface ToolOnboardingValidationIssue {
  step: keyof ToolOnboardingStepState;
  message: string;
}

export interface ToolOnboardingValidationResult {
  valid: boolean;
  issues: ToolOnboardingValidationIssue[];
}

/** Result of completing onboarding — the real, now-listed catalog tool. */
export interface CreatedOpenSourceTool {
  id: string;
  slug: string;
  name: string;
}