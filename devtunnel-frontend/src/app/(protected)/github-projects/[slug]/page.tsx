import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/config";
import { getGithubProjectBySlug } from "@/lib/github-projects/api";
import { RepoLogo } from "@/components/admin/repo-logo";
import { ChevronLeftIcon, GitBranchIcon } from "@/components/layout/nav-icons";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { GithubProjectDetailTabs } from "@/components/github-projects/github-project-detail-tabs";
import { GithubProjectSidebar } from "@/components/github-projects/github-project-sidebar";
import { RequestOnboardingButton } from "@/components/github-projects/request-onboarding-button";
import { StarButton } from "@/components/github-projects/star-button";
import { ContributeToRepoButton } from "@/components/github-projects/contribute-to-repo-button";

interface GithubProjectDetailPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Data-driven per rule 48 — describes the actual repository, never a
 * hardcoded string repeated for every slug. Falls back to the generic
 * "GitHub Project" only when the fetch hasn't resolved to a real name
 * yet, never `undefined` (rule 49). `noIndex: true` — same posture
 * `/github-projects` itself already takes (this route lives under the
 * `(protected)` group and is a signed-in contributor's view, not public
 * content).
 */
export async function generateMetadata({
  params,
}: GithubProjectDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getGithubProjectBySlug(slug);
  const title = result.status === "ok" ? result.data.name : "GitHub Project";

  return buildMetadata({
    title,
    description:
      result.status === "ok"
        ? `${result.data.repositoryFullName} on GitHub — README, open issues, and project info.`
        : "View this GitHub repository.",
    path: `/github-projects/${slug}`,
    noIndex: true,
  });
}

/**
 * `/github-projects/:slug` — the destination `GithubProjectCard` now
 * links to internally, instead of opening the repository straight out to
 * GitHub. Fetches `GET /github-projects/:slug`
 * (`lib/github-projects/api.ts`) server-side and renders the repository
 * the way a contributor deciding whether to get involved would want to
 * see it.
 *
 * Two-column layout: the tabbed body (`GithubProjectDetailTabs` — Project
 * Info / README / Issues) on the left, and a persistent
 * `GithubProjectSidebar` ("About" card, maintainer, clone command, share
 * link) pinned on the right — the same shape GitHub's own repository
 * page uses (file tree + tabs on the left, an "About" rail on the
 * right), rather than making every fact compete for space inside one
 * tab. `project.owner` was already part of the fetched
 * `GithubProjectDetail` shape (`lib/github-projects/types.ts`) but had no
 * home anywhere on this page before the sidebar existed.
 *
 * Header is deliberately slimmer than before: name, the real
 * `repositoryFullName` link, and "Updated <relative time>" — the
 * stars/forks/issues counts that used to live here now live once, in
 * the sidebar, instead of being repeated in two places on the same page.
 *
 * Same three-outcome handling `TaskDetailPage` already establishes: a
 * slug that doesn't match any catalog entry renders Next's real 404 via
 * `notFound()` rather than a fabricated "empty project" page
 * (Frontend_Development_Rules.txt rule 25); a network failure degrades
 * to the illustrated `GithubEmptyState` instead.
 *
 * Four actions sit next to the header, in the order a contributor would
 * actually want them: `ContributeToRepoButton` (the one accent-colored
 * button — opens `/github-projects/:slug/contribute`, this repository's
 * own DevTunnel Contribute page, same destination shape `ContributeButton`
 * opens for an onboarded project), "View on GitHub" (the plain repository
 * itself), `StarButton`, and `RequestOnboardingButton` (nominate it for
 * DevTunnel). See `ContributeToRepoButton`'s own doc comment for why it's
 * a plain link rather than a join-then-navigate action — there's no
 * contributor relationship to join yet on a repository that isn't a
 * DevTunnel project or tool.
 */
export default async function GithubProjectDetailPage({
  params,
}: GithubProjectDetailPageProps) {
  const { slug } = await params;
  const result = await getGithubProjectBySlug(slug);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href="/github-projects"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back to GitHub Projects
        </Link>
        <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
          <Link href="/github-projects" className="hover:text-accent">
            GitHub Projects
          </Link>
          {" / "}
          <span className="text-text-muted">Project</span>
        </nav>
        <h1 className="m-0 mb-6 text-xl font-medium text-text">GitHub Project</h1>
        <GithubEmptyState
          variant="no-results"
          title="This project isn't available right now"
          description="We couldn't reach GitHub for this repository just now. Check back soon, or head back to the full catalog."
          primaryAction={{ label: "Back to GitHub Projects", href: "/github-projects" }}
        />
      </main>
    );
  }

  const project = result.data;
  const shareUrl = `${SITE_URL}/github-projects/${project.slug}`;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/github-projects"
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
        Back to GitHub Projects
      </Link>
      <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
        <Link href="/github-projects" className="hover:text-accent">
          GitHub Projects
        </Link>
        {" / "}
        <span className="text-text-muted">{project.name}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <RepoLogo repositoryFullName={project.repositoryFullName} size={56} />
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-xl font-medium text-text">{project.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-text-secondary">
              <a
                href={project.repositoryUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 font-mono hover:text-accent"
              >
                <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
                {project.repositoryFullName}
              </a>
              <span aria-hidden="true" className="text-text-faint">
                ·
              </span>
              <span>
                Updated <time dateTime={project.pushedAt}>{formatRelativeTime(project.pushedAt)}</time>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ContributeToRepoButton slug={project.slug} basePath="/github-projects" />
          <a
            href={project.repositoryUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
          >
            <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
            View on GitHub
          </a>
          <StarButton
            slug={project.slug}
            initialStarredByViewer={project.isStarredByViewer}
            initialLocalStarCount={project.localStarCount}
          />
          <RequestOnboardingButton slug={project.slug} />
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <GithubProjectDetailTabs project={project} issuesBasePath="/github-projects" />
        </div>
        <GithubProjectSidebar project={project} shareUrl={shareUrl} />
      </div>
    </main>
  );
}
