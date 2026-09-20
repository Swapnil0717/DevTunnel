import { PlusIcon } from "@/components/layout/nav-icons";

interface ContributeOnGithubButtonProps {
  /** The repository's real GitHub URL, e.g. `https://github.com/owner/repo`. */
  repositoryUrl: string;
}

/**
 * Header CTA for a raw GitHub-catalog detail page — `GithubProjectDetailPage`
 * (`/github-projects/:slug`) and `GithubToolDetailPage`
 * (`/github-open-source-tools/:slug`). Same accent-colored, primary-action
 * styling `ContributeButton` (`components/projects/contribute-button.tsx`)
 * and `ContributeToToolButton`
 * (`components/opensource-tools/contribute-to-tool-button.tsx`) use on the
 * onboarded Project/Tool detail pages — this page gets one obvious
 * accent-colored next step too, instead of "View on GitHub" being the
 * closest thing to it.
 *
 * **Not the same destination as those two**, deliberately. `ContributeButton`
 * and `ContributeToToolButton` open `/projects/:slug/contribute` /
 * `/opensource-tools/:slug/contribute` — DevTunnel's own contribute pages,
 * which only exist for a repository that's already been onboarded as a
 * DevTunnel Project or Tool (`devtunnel.tasks` and the rest of that flow
 * hang off *that* record, sql/017). A repository sitting in the raw GitHub
 * catalog has no such record yet, so there's no DevTunnel contribute page to
 * send anyone to.
 *
 * What every GitHub repository *does* have is its own contribute page —
 * `github.com/:owner/:repo/contribute` — GitHub's built-in "good first
 * issue" picker for that exact repository, sourced straight from the
 * project's own CONTRIBUTING guide and issue tracker. That's "the same
 * context" this button can honestly offer here: the real upstream repo,
 * not a DevTunnel page that doesn't exist for it yet. Once a repository is
 * actually converted into a DevTunnel project or tool, its card and detail
 * page move to `/projects/:slug` or `/opensource-tools/:slug`, where
 * `ContributeButton` / `ContributeToToolButton` take over.
 */
export function ContributeOnGithubButton({ repositoryUrl }: ContributeOnGithubButtonProps) {
  const contributeHref = `${repositoryUrl.replace(/\/$/, "")}/contribute`;

  return (
    <a
      href={contributeHref}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
    >
      <PlusIcon className="h-3.5 w-3.5 shrink-0" />
      Contribute on GitHub
    </a>
  );
}
