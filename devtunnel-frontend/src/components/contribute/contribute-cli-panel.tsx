import { CopyButton } from "@/components/github-projects/copy-button";
import { CLI_COMMANDS, type CliBackendStatus } from "@/lib/contribute/cli-commands";

/**
 * "Submit via DevTunnel CLI" tab — the planned `dev` command-line tool,
 * laid out as one row per command: what it does on the contributor's
 * machine, and what (if anything) it calls on the DevTunnel backend.
 *
 * This is documentation for a tool that doesn't exist yet, not a
 * how-to for one you can install today — there's no `dev` binary and
 * no `/auth/cli/*` route behind it. The banner up top says that
 * outright rather than letting five copyable-looking commands imply
 * otherwise (rule 58 — don't dress a plan up as a shipped feature).
 * Because of that, commands here render as plain `<code>`, not through
 * `CommandBlock`: that component's copy button is for text a
 * contributor can actually paste into a working shell right now, and
 * this text can't be.
 *
 * A table, not the numbered-step cards the "How to submit" tab uses —
 * these five commands aren't a sequence with a fixed order (`dev test`
 * can run any number of times between a `dev start` and a `dev
 * submit`), and the thing worth comparing across all five is the same
 * two columns every time. Wrapped in an `overflow-x-auto` track so the
 * table scrolls on narrow screens instead of squeezing its columns
 * unreadably thin.
 */
export function ContributeCliPanel() {
  return (
    <div>
      <div className="mb-4">
        <h3 className="m-0 text-[13px] font-medium text-text">Commands and what they actually do</h3>
        <p className="m-0 mt-1 text-[12px] leading-relaxed text-text-muted">
          The planned <code className="rounded-[4px] bg-surface-raised px-1 py-0.5 font-mono text-[11px] text-text-secondary">dev</code>{" "}
          CLI, and what each command runs locally versus on the DevTunnel backend.
        </p>
      </div>

      <div className="mb-4 flex items-center gap-3 rounded-[9px] border border-status-idle/25 bg-status-idle-bg px-3.5 py-2.5 text-[12.5px] text-status-idle-text">
        <span>
          Not shipped yet — the <code className="font-mono">dev</code> binary and its backend
          routes don&apos;t exist. This table documents the intended workflow ahead of the tool
          being built.
        </span>
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-border-subtle">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border-subtle bg-surface-raised">
              <th className="w-[220px] p-3 text-[11px] font-medium uppercase tracking-wide text-text-faint">
                Command
              </th>
              <th className="p-3 text-[11px] font-medium uppercase tracking-wide text-text-faint">
                Local (CLI)
              </th>
              <th className="p-3 text-[11px] font-medium uppercase tracking-wide text-text-faint">
                Backend (new / reused)
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
                  <div className="flex items-start gap-1.5">
                    <code className="whitespace-nowrap rounded-[6px] bg-bg px-2 py-1 font-mono text-[11.5px] text-text-secondary">
                      {row.command}
                    </code>
                    <CopyButton value={row.command} label={`Copy ${row.command}`} />
                  </div>
                  <BackendStatusPill status={row.backendStatus} />
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

/**
 * A small pill under the command, so "does this need new backend work"
 * is scannable without reading the full sentence in the third column
 * (still never the *only* place that's said — the sentence next to it
 * carries the same information, per rule 43).
 */
function BackendStatusPill({ status }: { status: CliBackendStatus }) {
  if (status === "none") {
    return <p className="m-0 mt-2 text-[10.5px] text-text-faint">No backend call</p>;
  }

  return (
    <span className="mt-2 inline-block rounded-full bg-status-idle-bg px-2 py-[2px] text-[10px] font-medium text-status-idle-text">
      New endpoint
    </span>
  );
}