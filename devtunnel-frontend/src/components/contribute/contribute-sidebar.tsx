import Link from "next/link";
import { CopyButton } from "@/components/github-projects/copy-button";
import { getTechTagClasses } from "@/lib/home/tag-style";
import { CONTRIBUTION_MOTIVATIONS } from "@/lib/contribute/contribution-ways";
import type { ContributeTarget } from "@/lib/contribute/types";

/**
 * The Contribute page's right-hand rail: the repository files a first-time
 * contributor needs to read, the clone command, and — last, because it's
 * the least urgent thing on the page — the reasons people start.
 *
 * Same rail shape and card styling `ProjectDetailSidebar` and
 * `ToolDetailSidebar` use, so the Contribute page reads as part of the
 * project rather than as a separate microsite. On narrow screens it
 * stacks under the tabs, same as they do.
 *
 * The three repository links are built with `/blob/HEAD/...` rather than a
 * branch name: `HEAD` resolves to whatever the default branch is called,
 * so this keeps working on a repository that renamed `master` to `main`
 * and on one that didn't. A repository that genuinely has no
 * CONTRIBUTING.md will land on GitHub's own 404 for that path — which is
 * a truthful answer to "does this project have a contributing guide?",
 * and cheaper than a preflight request per file just to hide a link.
 */
export function ContributeSidebar({ target }: { target: ContributeTarget }) {
  const repoFiles = target.repositoryUrl
    ? [
        { label: "CONTRIBUTING.md", href: `${target.repositoryUrl}/blob/HEAD/CONTRIBUTING.md` },
        { label: "README.md", href: `${target.repositoryUrl}/blob/HEAD/README.md` },
        {
          label: "Code of conduct",
          href: `${target.repositoryUrl}/blob/HEAD/CODE_OF_CONDUCT.md`,
        },
        { label: "Open issues", href: `${target.repositoryUrl}/issues` },
      ]
    : [];

  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
      <div className="rounded-[10px] border border-border bg-surface p-4">
        <h2 className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint">
          Before your first change
        </h2>

        {repoFiles.length > 0 ? (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {repoFiles.map((file) => (
              <li key={file.label}>
                <a
                  href={file.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-[12.5px] text-text-secondary hover:text-accent"
                >
                  {file.label}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[12.5px] text-text-muted">
            This tool has no GitHub repository on DevTunnel, so its own site is where the
            contribution rules live.
          </p>
        )}

        {target.openIssuesCount !== null ? (
          <p className="m-0 mt-3 border-t border-border-subtle pt-3 text-[12px] text-text-faint">
            {target.openIssuesCount.toLocaleString()} open issues on GitHub
          </p>
        ) : null}
      </div>

      {target.cloneUrl ? (
        <div className="rounded-[10px] border border-border bg-surface p-4">
          <h2 className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint">
            Clone your fork
          </h2>
          <div className="flex items-center gap-2 rounded-[8px] border border-border-subtle bg-bg px-2.5 py-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-text-secondary">
              git clone {target.cloneUrl}
            </code>
            <CopyButton value={`git clone ${target.cloneUrl}`} label="Copy clone command" />
          </div>
          <p className="m-0 mt-2 text-[11.5px] text-text-faint">
            Clone your own fork to push to it. This is the upstream URL — useful as your{" "}
            <code className="font-mono">upstream</code> remote.
          </p>
        </div>
      ) : null}

      {target.techStack.length > 0 ? (
        <div className="rounded-[10px] border border-border bg-surface p-4">
          <h2 className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint">
            What you&apos;ll be working in
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {target.techStack.map((tag) => (
              <span
                key={tag}
                className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10.5px] ${getTechTagClasses(tag)}`}
              >
                {tag}
              </span>
            ))}
          </div>
          {target.license ? (
            <p className="m-0 mt-3 border-t border-border-subtle pt-3 text-[12px] text-text-faint">
              Licensed {target.license}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-[10px] border border-border bg-surface p-4">
        <h2 className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint">
          Why people start
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {CONTRIBUTION_MOTIVATIONS.map((motivation) => (
            <li key={motivation.id}>
              <p className="m-0 text-[12.5px] text-text-secondary">{motivation.label}</p>
              <p className="m-0 mt-0.5 text-[11.5px] text-text-faint">{motivation.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-[10px] border border-border bg-surface p-4">
        <h2 className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint">
          Elsewhere on DevTunnel
        </h2>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          <li>
            <Link href="/tasks" className="text-[12.5px] text-text-secondary hover:text-accent">
              Tasks across every project
            </Link>
          </li>
          <li>
            <Link href="/issues" className="text-[12.5px] text-text-secondary hover:text-accent">
              All open issues
            </Link>
          </li>
          <li>
            <Link href="/projects" className="text-[12.5px] text-text-secondary hover:text-accent">
              Browse other projects
            </Link>
          </li>
        </ul>
      </div>
    </aside>
  );
}
