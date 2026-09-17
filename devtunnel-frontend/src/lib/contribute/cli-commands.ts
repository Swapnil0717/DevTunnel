/**
 * The `dev` CLI's command surface, as shown on the Contribute page's
 * "Submit via DevTunnel CLI" tab.
 *
 * This documents a planned workflow, not a shipped one — there's no
 * `/auth/cli/*` route and no installable `dev` binary yet. The tab says
 * so plainly (see `ContributeCliPanel`) rather than presenting these as
 * commands a contributor can run today (rule 58 — don't dress a plan up
 * as a feature).
 *
 * `dev start` and `dev submit` are built per-target rather than kept as
 * static strings, so the id every contributor actually needs is already
 * sitting in the command:
 *
 *  - Contributing to the project or tool itself, with no specific task
 *    in mind, needs only the project's own id — its slug, the same
 *    identifier every other DevTunnel URL for it already uses. There's
 *    nothing else to type, so no second placeholder (a `<task-id>` or a
 *    generic `<id>`) belongs in that row.
 *  - Picking up a specific DevTunnel task (which, for a project, is
 *    always backed by a GitHub issue — `TaskGithubIssueRef` in
 *    `lib/tasks/types.ts`) needs both ids: which project, and which
 *    task within it. Both are real values pulled from `target`, not
 *    placeholders the contributor has to substitute by hand.
 *
 * A tool never carries DevTunnel tasks (sql/017 — see `ContributeTarget`
 * in `lib/contribute/types.ts`), so `buildCliCommands` only ever emits
 * the task-scoped rows when `target.tasks` is non-empty. For a tool,
 * that's always the project-only pair.
 *
 * Kept as a plain function returning data, not JSX, for the same reason
 * `workflow-steps.ts` and `contribution-ways.ts` are: the command
 * surface can grow by one entry here without touching the component
 * that renders it.
 *
 * `backendStatus` distinguishes a route DevTunnel would have to build
 * (`new`), one that already exists and just gets called from the CLI
 * (`reused`), and a command that never leaves the contributor's machine
 * (`none`) — `dev test` runs entirely against the repo it's in, so no
 * DevTunnel endpoint is involved at all.
 */

export type CliBackendStatus = "new" | "reused" | "none";

export interface CliCommand {
  id: string;
  /** The literal, copyable command — real ids substituted in, never a `<placeholder>`. */
  command: string;
  /** What runs on the contributor's machine. */
  local: string;
  /** What happens on the DevTunnel backend, if anything. */
  backend: string;
  backendStatus: CliBackendStatus;
}

/** The minimum this file needs from a task to build a task-scoped example command. */
export interface CliCommandTaskInput {
  id: string;
}

export interface CliCommandsInput {
  /** The project's own id in every other DevTunnel URL — what `dev start`/`dev submit` take when there's no specific task to scope to. */
  projectSlug: string;
  /** This target's curated DevTunnel tasks, if any. Always `[]` for a tool. */
  tasks: CliCommandTaskInput[];
}

export function buildCliCommands({ projectSlug, tasks }: CliCommandsInput): CliCommand[] {
  // One real task id to build the task-scoped example rows with. `dev`
  // doesn't care which task — any of them demonstrates the shape — so
  // the first curated one is as good as any other.
  const exampleTaskId = tasks[0]?.id ?? null;

  const commands: CliCommand[] = [
    {
      id: "login",
      command: "dev login",
      local: "Opens a loopback OAuth flow in the browser and stores the resulting token locally.",
      backend: "new — /auth/cli/*",
      backendStatus: "new",
    },
    {
      id: "logout",
      command: "dev logout",
      local: "Deletes the local token.",
      backend: "new — DELETE /auth/cli/tokens/:id",
      backendStatus: "new",
    },
    {
      id: "start-project",
      command: `dev start ${projectSlug}`,
      local:
        "Clones the fork, adds the upstream remote, checks out a branch named per the project's CONTRIBUTING.md convention, and prints a vscode:// deep link (or a --zip archive instead).",
      backend:
        "new — POST /projects/:slug/start. Forks the repository server-side using your stored GitHub token and returns the fork URL.",
      backendStatus: "new",
    },
  ];

  if (exampleTaskId) {
    commands.push({
      id: "start-task",
      command: `dev start ${projectSlug} ${exampleTaskId}`,
      local:
        "Same as dev start on its own, but scoped to that task: the branch is named for the task instead of a generic one.",
      backend:
        "new — POST /tasks/:id/start. Forks the repository server-side using your stored GitHub token, marks the task IN_PROGRESS, and returns the fork URL.",
      backendStatus: "new",
    });
  }

  commands.push(
    {
      id: "test",
      command: "dev test",
      local:
        "Runs git fetch upstream, then pulls or rebases if the branch is behind. Auto-detects and runs the repo's own test/build command (npm test, pytest, cargo test, etc.).",
      backend: "None required for v1 — this command never talks to DevTunnel.",
      backendStatus: "none",
    },
    {
      id: "submit-project",
      command: `dev submit ${projectSlug}`,
      local: "Walks through an interactive conventional-commit prompt, then pushes to the fork.",
      backend:
        "new — POST /projects/:slug/submit. Opens the pull request server-side (using the stored GitHub token) and fills in the PR template.",
      backendStatus: "new",
    },
  );

  if (exampleTaskId) {
    commands.push({
      id: "submit-task",
      command: `dev submit ${projectSlug} ${exampleTaskId}`,
      local:
        "Same as dev submit on its own, but for that task: also links the underlying GitHub issue and marks the task IN_REVIEW.",
      backend:
        "new — POST /tasks/:id/submit. Opens the pull request server-side (using the stored GitHub token), fills in the PR template, links the issue, and marks the task IN_REVIEW.",
      backendStatus: "new",
    });
  }

  return commands;
}