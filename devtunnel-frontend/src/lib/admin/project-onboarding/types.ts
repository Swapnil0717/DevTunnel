/**
 * Local, frontend-only shape for the Admin **Project Onboarding** wizard
 * (admin_workflow.txt, section 6 — "Project Onboarding" — and section 24,
 * "Project Onboarding State").
 *
 * This mirrors the onboarding-draft model the spec describes rather than
 * a final `Project` row: "The project does not exist as an active
 * DevTunnel project before [final validation]." Every field here is
 * either something GitHub supplied automatically or something the Admin
 * explicitly chose — never something this frontend invents
 * (Frontend_Development_Rules.txt rule 58/59). Same convention as
 * `lib/onboarding/types.ts` on the contributor side: the backend isn't
 * part of this deliverable, so the request/response shapes below are a
 * documented assumption built directly from the endpoints admin_workflow.txt
 * specifies (section 22 — Admin Backend API Map), not from an existing
 * schema file.
 */

/**
 * A single GitHub identity as returned for an author or a contributor —
 * section 5 ("DevTunnel contributors" / "GitHub Contributors") and
 * section 26 ("Author / Owner", "GitHub Contributors").
 */
 export interface OnboardingGithubIdentity {
    username: string;
    name: string | null;
    avatarUrl: string | null;
    profileUrl: string;
  }
  
  /**
   * Step 1 result — "Import GitHub Repository" (section: "Step 1 — Import
   * GitHub Repository"). Every field here comes back from GitHub through
   * the backend's repository-import algorithm; the Admin only ever
   * supplies `repositoryUrl` as input (see `importRepository` in `api.ts`).
   * The spec is explicit that Author, GitHub username, repository name,
   * contributors, language, stars, forks and issues must never be
   * hand-typed by the Admin — this type has no writable counterpart for
   * any of them.
   */
  export interface OnboardingRepository {
    url: string;
    owner: string;
    name: string;
    fullName: string;
    /** Repository description exactly as GitHub has it, or `null` if unset. */
    githubDescription: string | null;
    /** Full README content/markdown as fetched from the default branch. */
    readme: string | null;
    defaultBranch: string;
    primaryLanguage: string | null;
    stars: number;
    forks: number;
    openIssues: number;
    author: OnboardingGithubIdentity;
    /** GitHub contributors — distinct from DevTunnel contributors (section 27). */
    contributors: OnboardingGithubIdentity[];
    /**
     * Whether the DevTunnel GitHub App is actually installed with access to
     * this repository ("Check GitHub App access" in the Step 1 algorithm).
     * `false` means the repository was resolved but can't be imported yet —
     * the wizard surfaces this rather than silently failing.
     */
    hasGithubAppAccess: boolean;
  }
  
  /**
   * Step 2 — "Project Description". The spec gives the Admin exactly two
   * choices, never a free rewrite of the GitHub description itself: use
   * what already exists, or layer a DevTunnel-only custom description on
   * top of it. "Do not overwrite the GitHub README."
   */
  export type DescriptionChoice = "EXISTING" | "CUSTOM";
  
  export interface OnboardingDescription {
    choice: DescriptionChoice;
    /** Only meaningful when `choice === "CUSTOM"`. */
    customDescription: string | null;
  }
  
  /**
   * Step 3 — "Project Tech Stack". Field grouping follows the categories
   * the spec lists explicitly (Frontend / Backend / Language / Framework /
   * Database / Libraries / Build Tools / Package Manager), folded into the
   * arrays a repository-analysis pass can realistically populate.
   * `packageManager` is singular since a repository normally has one
   * (npm/pnpm/pip/cargo/...). "The exact fields should follow what the
   * repository analysis can actually determine" — every array defaults to
   * `[]`, never a fabricated guess.
   */
  export interface OnboardingTechStack {
    languages: string[];
    frontend: string[];
    backend: string[];
    frameworks: string[];
    databases: string[];
    libraries: string[];
    buildTools: string[];
    packageManager: string | null;
  }
  
  export const EMPTY_TECH_STACK: OnboardingTechStack = {
    languages: [],
    frontend: [],
    backend: [],
    frameworks: [],
    databases: [],
    libraries: [],
    buildTools: [],
    packageManager: null,
  };
  
  /**
   * Backend-authoritative completion flags (section 24 — "Do not let the
   * frontend determine whether onboarding is complete. Backend should
   * maintain the state."). The wizard reads these from every draft
   * response to decide what it's allowed to let the Admin do next — it
   * never derives "is step N done" purely from local component state.
   */
  export interface ProjectOnboardingStepState {
    repositoryCompleted: boolean;
    descriptionCompleted: boolean;
    techStackCompleted: boolean;
    previewCompleted: boolean;
    validationCompleted: boolean;
  }
  
  export const EMPTY_STEP_STATE: ProjectOnboardingStepState = {
    repositoryCompleted: false,
    descriptionCompleted: false,
    techStackCompleted: false,
    previewCompleted: false,
    validationCompleted: false,
  };
  
  /**
   * The onboarding draft as a whole — "Onboarding Draft, not the final
   * project" (Step 1 algorithm). `id` is assigned by the backend the
   * moment Step 1 succeeds, then threaded through every later request
   * (`PATCH/POST /admin/projects/onboarding/:id/...`).
   */
  export interface ProjectOnboardingDraft {
    id: string;
    repository: OnboardingRepository | null;
    description: OnboardingDescription | null;
    techStack: OnboardingTechStack | null;
    steps: ProjectOnboardingStepState;
  }
  
  /** A single unmet-requirement message from `POST .../:id/validate`. */
  export interface ProjectOnboardingValidationIssue {
    step: keyof ProjectOnboardingStepState;
    message: string;
  }
  
  export interface ProjectOnboardingValidationResult {
    valid: boolean;
    issues: ProjectOnboardingValidationIssue[];
  }
  
  /** Result of `POST /admin/projects/onboarding/:id/complete`. */
  export interface CreatedProject {
    id: string;
    slug: string;
    name: string;
  }