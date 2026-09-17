import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeftIcon, GitBranchIcon, CheckCircleIcon } from "@/components/layout/nav-icons";
import type { ContributeTarget } from "@/lib/contribute/types";

/**
 * Header for both Contribute routes — breadcrumb, back link, the target's
 * name and repository, and the one line that says where the contributor
 * stands.
 *
 * `logo` comes in as a node rather than being chosen here: a project
 * renders `DevtunnelProjectLogo` (keyed on the repository), a tool renders
 * `OpenSourceToolLogo` (keyed on its source URL). Passing the element in
 * keeps this component from needing to know which of the two it's
 * looking at, and keeps each route using the logo component it already
 * uses on its own detail page.
 *
 * There is deliberately no accent-colored button up here. The detail page
 * owns the "Contribute to this project" action; by the time someone is on
 * this page they've taken it, and the next real decision is a task or a
 * way to help, which lives in the body. Repeating the join action here
 * would give the page two primary actions and no obvious next step.
 *
 * The contributing state is stated in words next to a checkmark, never by
 * the checkmark alone (rule 43).
 */
export function ContributePageHeader({
  target,
  logo,
}: {
  target: ContributeTarget;
  logo: ReactNode;
}) {
  return (
    <>
      <Link
        href={target.detailHref}
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
        Back to {target.name}
      </Link>

      <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
        <Link href={target.listHref} className="hover:text-accent">
          {target.listLabel}
        </Link>
        {" / "}
        <Link href={target.detailHref} className="hover:text-accent">
          {target.name}
        </Link>
        {" / "}
        <span className="text-text-muted">Contribute</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {logo}
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="m-0 text-xl font-medium text-text">Contribute to {target.name}</h1>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-text-secondary">
              {target.repositoryUrl && target.repositoryFullName ? (
                <a
                  href={target.repositoryUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 font-mono hover:text-accent"
                >
                  <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
                  {target.repositoryFullName}
                </a>
              ) : null}

              {target.viewerIsContributing ? (
                <>
                  {target.repositoryUrl ? (
                    <span aria-hidden="true" className="text-text-faint">
                      ·
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5 text-status-success-label">
                    <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
                    You&apos;ve joined this{" "}
                    {target.kind === "project" ? "project" : "tool"}
                  </span>
                </>
              ) : null}
            </div>

            {target.description ? (
              <p className="m-0 max-w-[70ch] text-[12.5px] leading-relaxed text-text-muted">
                {target.description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <Link
            href={target.detailHref}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
          >
            {target.kind === "project" ? "Project overview" : "Tool overview"}
          </Link>
          {target.repositoryUrl ? (
            <a
              href={target.repositoryUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
            >
              <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
              View on GitHub
            </a>
          ) : null}
        </div>
      </div>
    </>
  );
}
