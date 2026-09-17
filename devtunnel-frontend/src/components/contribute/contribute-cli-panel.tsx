import { CommandBlock } from "@/components/contribute/command-block";
import { CLI_COMMANDS } from "@/lib/contribute/cli-commands";

/**
 * "Submit via DevTunnel CLI" tab — the `dev` command-line tool, laid out
 * as one step per command: what it does on the contributor's machine,
 * and what (if anything) it calls on the DevTunnel backend.
 *
 * Shipped, not planned — `@devtunnelcli/cli` is published on npm and
 * every backend route it calls is live. Commands render through the same
 * `CommandBlock` the git-based "How to submit" tab uses (with a real
 * copy button) rather than plain `<code>`, because unlike the earlier
 * version of this tab, these genuinely are commands a contributor can
 * paste into a working shell right now.
 *
 * A table, not the numbered-step cards the "How to submit" tab uses —
 * these six steps aren't strictly a fixed sequence (`dev test` can run
 * any number of times between a `dev start` and a `dev submit`, and the
 * project-claim rows are alternatives to the task-claim ones, not
 * additional steps), and the thing worth comparing across all of them is
 * the same two columns every time. Wrapped in an `overflow-x-auto` track
 * so the table scrolls on narrow screens instead of squeezing its
 * columns unreadably thin.
 */
export function ContributeCliPanel() {
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
          CLI automates fork, branch, test, and pull-request creation — what each command runs
          locally versus on the DevTunnel backend.
        </p>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-border-subtle">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-raised">
              <th className="w-[260px] p-3 text-[11px] font-medium uppercase tracking-wide text-text-faint">
                Command
              </th>
              <th className="p-3 text-[11px] font-medium uppercase tracking-wide text-text-faint">
                Local (CLI)
              </th>
              <th className="p-3 text-[11px] font-medium uppercase tracking-wide text-text-faint">
                Backend
              </th>
            </tr>
          </thead>
          <tbody>
            {CLI_COMMANDS.map((row, index) => (
              <tr
                key={row.id}
                className={index < CLI_COMMANDS.length - 1 ? "border-b border-border-subtle" : ""}
              >
                <td className="p-3 align-top">
                  <p className="m-0 mb-1.5 text-[11.5px] font-medium text-text-faint">{row.title}</p>
                  <CommandBlock commands={row.commands} label={row.title} />
                </td>
                <td className="p-3 align-top text-[12px] leading-relaxed text-text-secondary">
                  {row.local}
                </td>
                <td className="p-3 align-top text-[12px] leading-relaxed text-text-secondary">
                  {row.backend}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
