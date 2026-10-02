// src/components/ui/wizard-skeleton-copy.ts
/**
 * The real copy of every onboarding wizard's shell and step 1, mirrored
 * here so the skeletons can ghost it (invisible text + hatched bar).
 *
 * Why the real strings and not fixed-width bars: line wrapping and
 * line-box height are what make a skeleton "match". A 3-line paragraph
 * that's drawn as 2 lines shifts the whole form when the page mounts.
 * Ghosting the exact text makes the browser do the wrapping, so it
 * wraps exactly where the real page does, at every breakpoint.
 *
 * KEEP IN SYNC with the wizard files noted on each block. If you edit
 * copy there, edit it here too (or move both to one shared module).
 */

export interface WizardShellCopy {
  /** "Back to X" link text. Omit when the wizard has no back link (`/onboarding`). */
  backLabel?: string;
  title: string;
  blurb: string;
  footnote: string;
  steps: { label: string; description: string }[];
}

/** components/onboarding/onboarding-wizard.tsx */
export const USER_ONBOARDING_SHELL: WizardShellCopy = {
  title: "Set up your profile",
  blurb: "A few quick steps so we can match you with the right open source projects.",
  // The real line is "Signed in as @{user.username}"; the username isn't
  // known to a loading.tsx, so a typical-length handle stands in.
  footnote: "Signed in as @username",
  steps: [
    { label: "Welcome", description: "Confirm what we imported from GitHub." },
    { label: "Your profile", description: "Tell us about your skills and interests." },
    { label: "Get started", description: "Choose how you'd like to start." },
    { label: "Review", description: "Double-check everything before you finish." },
  ],
};

/** components/admin/onboarding/project-onboarding-wizard.tsx */
export const PROJECT_ONBOARDING_SHELL: WizardShellCopy = {
  backLabel: "Back to Projects",
  title: "Project onboarding",
  blurb:
    "Import a GitHub repository and curate its DevTunnel representation. Nothing goes live until every step is validated.",
  footnote: "GitHub remains the source of truth — Admin curates the DevTunnel representation.",
  steps: [
    { label: "Repository", description: "Import the GitHub repository." },
    { label: "Description", description: "Choose the DevTunnel description." },
    { label: "Tech stack", description: "Review the detected tech stack." },
    { label: "Preview", description: "Preview the DevTunnel project." },
    { label: "Validation", description: "Confirm and create the project." },
  ],
};

/** components/admin/opensource-tool-onboarding/opensource-tool-onboarding-wizard.tsx */
export const TOOL_ONBOARDING_SHELL: WizardShellCopy = {
  backLabel: "Back to Open Source Tools",
  title: "Add open source tool",
  blurb:
    "Import a project by URL and curate how it appears in the DevTunnel open source tools catalog.",
  footnote: "Nothing is added to the catalog until every step is confirmed.",
  steps: [
    { label: "Tool URL", description: "Import the project by its URL." },
    { label: "Description", description: "Choose the DevTunnel description." },
    { label: "Labels", description: "Tag who this tool benefits." },
    { label: "Setup & usage", description: "Write how to set up and use it." },
    { label: "Preview & confirm", description: "Confirm and add the tool." },
  ],
};

/** components/admin/task-onboarding/task-onboarding-wizard.tsx */
export const TASK_ONBOARDING_SHELL: WizardShellCopy = {
  backLabel: "Back to Tasks",
  title: "Task onboarding",
  blurb:
    "Turn a GitHub issue into a DevTunnel task. Nothing is available to contributors until every step is validated.",
  footnote: "GitHub issues aren't modified — Admin curates the DevTunnel representation of the issue.",
  steps: [
    { label: "Project", description: "Choose the DevTunnel project." },
    { label: "Issue", description: "Pick an existing GitHub issue." },
    { label: "Task details", description: "Curate role, difficulty and description." },
    { label: "Preview", description: "Preview the DevTunnel task." },
    { label: "Validation", description: "Confirm and create the task." },
  ],
};

/** components/submissions/onboarding/submission-onboarding-wizard.tsx */
export const SUBMISSION_ONBOARDING_SHELL: WizardShellCopy = {
  backLabel: "Back to Community",
  title: "Submit a project or tool",
  blurb:
    "Share something you use or built. It goes on the community list with your name on it — DevTunnel doesn't review it.",
  footnote: "Nothing is published until you confirm on the last step.",
  steps: [
    { label: "Repository URL", description: "Fetch it from GitHub." },
    { label: "Description & tech", description: "How it appears on the list." },
    { label: "Preview & confirm", description: "Check it, then publish." },
  ],
};

/** The footer buttons are identical in every wizard on step 1. */
export const WIZARD_BACK_LABEL = "Back";
export const WIZARD_CONTINUE_LABEL = "Continue";

/** components/onboarding/steps/welcome-step.tsx */
export const WELCOME_STEP_COPY = {
  // Real: `Welcome, {user.name ?? user.username}` — name unknown here.
  heading: "Welcome, Your Name",
  body: "We imported your profile from GitHub. Next, let's set up your skills and interests so we can match you with the right projects.",
  // Real: `Imported from GitHub · @{user.githubUsername}`.
  badge: "Imported from GitHub · @username",
};

/** One URL-entry step: heading, intro, label + input + fetch button. */
export interface UrlStepCopy {
  heading: string;
  intro: string;
  label: string;
  placeholder: string;
  button: string;
}

/** components/admin/onboarding/steps/repository-step.tsx */
export const REPOSITORY_STEP_COPY: UrlStepCopy = {
  heading: "Import GitHub repository",
  intro:
    "Paste the repository's GitHub URL. DevTunnel fetches the author, contributors, README, default branch and language directly from GitHub — nothing here is typed in by hand.",
  label: "GitHub repository URL",
  placeholder: "https://github.com/owner/repository",
  button: "Fetch repository",
};

/** components/admin/opensource-tool-onboarding/steps/tool-url-step.tsx */
export const TOOL_URL_STEP_COPY: UrlStepCopy = {
  heading: "Tool URL",
  intro:
    "Paste the project's URL — its GitHub repository, if it has one. DevTunnel fetches the name, description and README directly from the source; nothing here is typed in by hand.",
  label: "Project URL",
  placeholder: "https://github.com/owner/repository",
  button: "Fetch tool",
};

/** components/submissions/onboarding/steps/source-url-step.tsx */
export const SOURCE_URL_STEP_COPY: UrlStepCopy = {
  heading: "Repository URL",
  intro:
    "Paste a public GitHub repository. DevTunnel reads the name, description, README and tech stack straight from it — you never type those in, and anyone reading your submission can check them against the source.",
  label: "GitHub repository URL",
  placeholder: "https://github.com/owner/repository",
  button: "Fetch repository",
};

export const SOURCE_URL_KIND_OPTIONS = [
  { label: "A project", description: "Something people can contribute to, run, or build on." },
  {
    label: "A tool",
    description: "Something people use while working — an app, a CLI, a service.",
  },
];

/** components/admin/task-onboarding/steps/project-selection-step.tsx */
export const PROJECT_SELECTION_STEP_COPY = {
  heading: "Select a project",
  intro:
    "Choose the DevTunnel project this task belongs to. Its GitHub issues load automatically once you pick one.",
  searchPlaceholder: "Search by project or repository",
  // Invisible stand-ins that give each placeholder row its real height.
  // Their lengths only vary the hatched bars' widths a little.
  rows: [
    { name: "Project name here", repo: "owner/repository-name", language: "TypeScript" },
    { name: "Another project", repo: "owner/another-repo", language: "Python" },
    { name: "A third project name", repo: "owner/third-repository", language: "Go" },
    { name: "Project four", repo: "owner/repo-four", language: "Rust" },
  ],
};
