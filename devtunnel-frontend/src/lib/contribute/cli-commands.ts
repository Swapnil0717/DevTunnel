/**
 * The `dev` CLI's command surface, as shown on the Contribute page's
 * "Submit via DevTunnel CLI" tab.
 *
 * This documents a shipped workflow — the CLI binary and the backend
 * routes behind it (`/auth/cli/*`, `/projects/:slug/start`,
 * `/tasks/:id/submit`, etc.) are live, so these are commands a
 * contributor can paste into a working shell right now, not a plan
 * dressed up as a feature (rule 58).
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
 * `description` is one short, plain-language line — what the command
 * does, not how it's implemented. The local/backend split this used to
 * carry lived closer to an API spec than to something a contributor
 * skimming the tab needs; one sentence per command is enough to know
 * what it's for.
 */

 export interface CliCommand {
  id: string;
  /** The literal, copyable command — real ids substituted in, never a `<placeholder>`. */
  command: string;
  /** One short, plain-language sentence on what this command does. */
  description: string;
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
      description: "Signs you in with GitHub and stores the token locally.",
    },
    {
      id: "logout",
      command: "dev logout",
      description: "Signs you out and deletes the local token.",
    },
    {
      id: "start-project",
      command: `dev start ${projectSlug}`,
      description: "Forks the repo, clones it, and checks out a new branch to work on.",
    },
  ];

  if (exampleTaskId) {
    commands.push({
      id: "start-task",
      command: `dev start ${projectSlug} ${exampleTaskId}`,
      description: "Same as dev start, scoped to one task — the branch is named for it.",
    });
  }

  commands.push(
    {
      id: "test",
      command: "dev test",
      description: "Pulls the latest changes and runs the project's own tests locally.",
    },
    {
      id: "submit-project",
      command: `dev submit ${projectSlug}`,
      description: "Commits your changes, pushes them, and opens a pull request.",
    },
  );

  if (exampleTaskId) {
    commands.push({
      id: "submit-task",
      command: `dev submit ${projectSlug} ${exampleTaskId}`,
      description: "Same as dev submit, but also links the task's issue and marks it in review.",
    });
  }

  return commands;
}