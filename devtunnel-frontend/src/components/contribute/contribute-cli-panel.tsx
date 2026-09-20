import { CommandBlock } from "@/components/contribute/command-block";
import { buildCliCommands } from "@/lib/contribute/cli-commands";
import type { ContributeTarget } from "@/lib/contribute/types";

/**
 * "Submit via DevTunnel CLI" tab — the `dev` command-line tool, laid out
 * as one row per command with a short, plain-language description of
 * what it does.
 *
 * Shipped, not planned — the CLI binary and the backend routes behind it
 * are live, so these are commands a contributor can paste into a working
 * shell right now. `dev start`/`dev submit` are still built per-target
 * via `buildCliCommands` so the example already carries this project's real
 * DevTunnel id (and a real task id, once it has curated tasks)
 * rather than a `<placeholder>` the contributor has to fill in by hand.
 *
 * Commands render through the same `CommandBlock` the git-based "How to
 * submit" tab uses (with a real copy button) rather than plain `<code>`,
 * so a contributor can copy the exact line as-is.
 *
 * A table, not the numbered-step cards the "How to submit" tab uses —
 * these steps aren't strictly a fixed sequence (`dev test` can run any
 * number of times between a `dev start` and a `dev submit`, and the
 * project-claim rows are alternatives to the task-claim ones, not
 * additional steps). Wrapped in an `overflow-x-auto` track so the table
 * scrolls on narrow screens instead of squeezing its columns unreadably
 * thin.
 */
export function ContributeCliPanel({ target }: { target: ContributeTarget }) {
  const commands = buildCliCommands({ projectId: target.projectId, tasks: target.tasks });

  return (
    <div>
      <div className="mb-4">
        <h3 className="m-0 text-[13px] font-medium text-text">
          Install once, then run these
        </h3>
        <p className="m-0 mt-1 text-[12px] leading-relaxed text-text-secondary">
          The{" "}
          <code className="rounded-[4px] bg-surface-raised px-1 py-0.5 font-mono text-[11px] text-text-secondary">
            dev
          </code>{" "}
          CLI automates fork, branch, test, and pull-request creation for you.
        </p>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-border-subtle">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-raised">
              <th className="w-[280px] p-3 text-[11px] font-medium uppercase tracking-wide text-text-faint">
                Command
              </th>
              <th className="p-3 text-[11px] font-medium uppercase tracking-wide text-text-faint">
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {commands.map((row, index) => (
              <tr
                key={row.id}
                className={index < commands.length - 1 ? "border-b border-border-subtle" : ""}
              >
                <td className="p-3 align-top">
                  <CommandBlock commands={[row.command]} label={row.command} />
                </td>
                <td className="p-3 align-top text-[12px] leading-relaxed text-text-secondary">
                  {row.description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {target.projectId && (
        <p className="m-0 mt-3 text-[12px] leading-relaxed text-text-secondary">
          The ID in the{" "}
          <code className="rounded-[4px] bg-surface-raised px-1 py-0.5 font-mono text-[11px] text-text-secondary">
            --project
          </code>{" "}
          commands is this project&apos;s DevTunnel ID, not its name from the URL — copy the commands
          exactly as shown.
        </p>
      )}
    </div>
  );
}