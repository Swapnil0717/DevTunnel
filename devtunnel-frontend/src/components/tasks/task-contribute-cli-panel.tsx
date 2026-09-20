import { CommandBlock } from "@/components/contribute/command-block";
import { buildCliCommands } from "@/lib/contribute/cli-commands";

/**
 * "Fastest way: the DevTunnel CLI" — the `dev` commands for picking up
 * *this one task*, in the order you run them.
 *
 * Built on `buildCliCommands` with `projectId: null` and this task as the
 * only task, which yields exactly the task-scoped rows (`dev start <task
 * id>`, `dev submit <task id>`) with the real id already substituted —
 * never a `<placeholder>` — plus the install/login/test rows every path
 * shares. `logout` is dropped: it isn't a step in getting this task done.
 * Re-using the builder rather than restating the commands keeps this page
 * from drifting from the project-level Contribute page's CLI tab
 * (Frontend_Development_Rules.txt rule 51).
 *
 * Numbered, unlike that tab's table, because on a task page this really is
 * a sequence: you can't submit before you've started. (`dev test` can be
 * repeated, which the note under the list says.)
 */
const STEP_TITLES: Record<string, string> = {
  install: "Install the CLI",
  login: "Sign in with GitHub",
  "start-task": "Start this task",
  test: "Run the tests",
  "submit-task": "Submit your work",
};

export function TaskContributeCliPanel({ taskId }: { taskId: string }) {
  const steps = buildCliCommands({ projectId: null, tasks: [{ id: taskId }] }).filter(
    (row) => row.id in STEP_TITLES,
  );

  return (
    <div>
      <div className="mb-4">
        <h3 className="m-0 text-[13px] font-medium text-text">
          Fastest way: the DevTunnel CLI
        </h3>
        <p className="m-0 mt-1 text-[12px] leading-relaxed text-text-secondary">
          The{" "}
          <code className="rounded-[4px] bg-surface-raised px-1 py-0.5 font-mono text-[11px] text-text-secondary">
            dev
          </code>{" "}
          CLI forks the repository, creates a branch for this task, and opens the pull request
          for you. The task ID is already filled in — copy the commands exactly as shown.
        </p>
      </div>

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className="rounded-[9px] border border-border-subtle bg-surface-raised p-3.5"
          >
            <p className="m-0 text-[13px] font-medium text-text">
              <span className="mr-1.5 font-mono text-[11.5px] text-text-faint">{index + 1}</span>
              {STEP_TITLES[step.id]}
            </p>
            <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-text-secondary">
              {step.description}
            </p>
            <div className="mt-2.5">
              <CommandBlock commands={[step.command]} label={STEP_TITLES[step.id] ?? step.id} />
            </div>
          </li>
        ))}
      </ol>

      <p className="m-0 mt-3 text-[11.5px] text-text-faint">
        You can run <code className="font-mono">dev test</code> as many times as you like between
        starting and submitting.
      </p>
    </div>
  );
}
