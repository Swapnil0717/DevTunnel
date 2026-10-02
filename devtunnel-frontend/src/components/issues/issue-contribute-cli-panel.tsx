import { CommandBlock } from "@/components/contribute/command-block";
import { ISSUE_CLI_STEP_TITLES, buildCliCommands } from "@/lib/contribute/cli-commands";

/**
 * "Fastest way: the DevTunnel CLI" for one GitHub issue — the `dev` commands
 * in the order you run them, with this issue's `owner/repo#number` already
 * filled in (never a `<placeholder>`).
 *
 * Shown on `/issues/:projectSlug/:issueNumber/contribute` for EVERY open issue
 * that has no DevTunnel task: issues of DevTunnel projects and issues of
 * GitHub-catalog repositories and tools alike. The CLI works on any public
 * GitHub repository, and the work still counts as a DevTunnel contribution —
 * `dev submit` adds it to the contribution calendar and a merge adds a second
 * entry (backend `POST /github/start` / `/github/submit`).
 *
 * Built on `buildCliCommands`, same as the Contribute page's CLI tab and the
 * task page's card, so the three can't drift apart.
 */
export function IssueContributeCliPanel({
  repositoryFullName,
  issueNumber,
}: {
  repositoryFullName: string;
  issueNumber: number;
}) {
  const steps = buildCliCommands({
    projectId: null,
    tasks: [],
    repositoryFullName,
    issueNumber,
  }).filter((row) => row.id in ISSUE_CLI_STEP_TITLES);

  return (
    <div>
      <div className="mb-4">
        <h3 className="m-0 text-[13px] font-medium text-text">Fastest way: the DevTunnel CLI</h3>
        <p className="m-0 mt-1 text-[12px] leading-relaxed text-text-secondary">
          The{" "}
          <code className="rounded-[4px] bg-surface-raised px-1 py-0.5 font-mono text-[11px] text-text-secondary">
            dev
          </code>{" "}
          CLI forks the repository, creates a branch for issue{" "}
          <span className="font-mono text-text-muted">#{issueNumber}</span>, and opens the pull request for you. It
          counts as a DevTunnel contribution even though this isn&apos;t a DevTunnel task. The repository and issue
          number are already filled in — copy the commands exactly as shown.
        </p>
      </div>

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((step, index) => (
          <li key={step.id} className="rounded-[9px] border border-border-subtle bg-surface-raised p-3.5">
            <p className="m-0 text-[13px] font-medium text-text">
              <span className="mr-1.5 font-mono text-[11.5px] text-text-faint">{index + 1}</span>
              {ISSUE_CLI_STEP_TITLES[step.id]}
            </p>
            <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-text-secondary">{step.description}</p>
            <div className="mt-2.5">
              <CommandBlock commands={[step.command]} label={ISSUE_CLI_STEP_TITLES[step.id] ?? step.id} />
            </div>
          </li>
        ))}
      </ol>

      <p className="m-0 mt-3 text-[11.5px] text-text-faint">
        You can run <code className="font-mono">dev test</code> as many times as you like between starting and
        submitting. Run <code className="font-mono">dev start</code> and <code className="font-mono">dev submit</code>{" "}
        in the same folder you started in.
      </p>
    </div>
  );
}
