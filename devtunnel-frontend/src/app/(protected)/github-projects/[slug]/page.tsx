import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getGithubProjectBySlug } from "@/lib/github-projects/api";
import { RepoLogo } from "@/components/admin/repo-logo";
import { ChevronLeftIcon, GitBranchIcon, StarIcon, IssueIcon } from "@/components/layout/nav-icons";
import { formatCompactNumber } from "@/lib/github-projects/format-compact-number";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { SectionMessage } from "@/components/home/section-message";
import { GithubProjectDetailTabs } from "@/components/github-projects/github-project-detail-tabs";
import { RequestOnboardingButton } from "@/components/github-projects/request-onboarding-button";
import { StarButton } from "@/components/github-projects/star-button";

interface GithubProjectDetailPageProps {
  params: { slug: string };
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
  const result = await getGithubProjectBySlug(params.slug);
  const title = result.status === "ok" ? result.data.name : "GitHub Project";

  return buildMetadata({
    title,
    description:
      result.status === "ok"
        ? `${result.data.repositoryFullName} on GitHub — README, open issues, and project info.`
        : "View this GitHub repository.",
    path: `/github-projects/${params.slug}`,
    noIndex: true,
  });
}

/**
 * `/github-projects/:slug` — the destination `GithubProjectCard` now
 * links to internally, instead of opening the repository straight out to
 * GitHub. Fetches `GET /github-projects/:slug`
 * (`lib/github-projects/api.ts`) server-side and renders the repository
 * the way a contributor deciding whether to get involved would want to
 * see it: identity and stats up top, then Project Info / README / Issues
 * as tabs (`GithubProjectDetailTabs`) so all three live on one page
 * without a wall of scrolling.
 *
 * Two actions sit next to the header: "View on GitHub" (unchanged —
 * always the real repository), and "Nominate for DevTunnel"
 * (`RequestOnboardingButton`) — a contributor-facing way to flag a
 * repository they think is worth an Admin running the full onboarding
 * flow on, without needing Admin access themselves or leaving this page.
 *
 * Same three-outcome handling `TaskDetailPage` already establishes: a
 * slug that doesn't match any catalog entry renders Next's real 404 via
 * `notFound()` rather than a fabricated "empty project" page
 * (Frontend_Development_Rules.txt rule 25); a network failure degrades
 * to one honest `SectionMessage` instead.
 */
export default async function GithubProjectDetailPage({
  params,
}: GithubProjectDetailPageProps) {
  const result = await getGithubProjectBySlug(params.slug);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
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
        <h1 className="m-0 mb-4 text-xl font-medium text-text">GitHub Project</h1>
        <SectionMessage>This project isn&apos;t available right now — check back soon.</SectionMessage>
      </main>
    );
  }

  const project = result.data;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
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

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
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
              <span
                className="inline-flex items-center gap-1"
                aria-label={`${project.stars.toLocaleString()} stars`}
              >
                <StarIcon className="h-3.5 w-3.5" />
                {formatCompactNumber(project.stars)}
              </span>
              <span aria-hidden="true" className="text-text-faint">
                ·
              </span>
              <span
                className="inline-flex items-center gap-1"
                aria-label={`${project.openIssuesCount.toLocaleString()} open issues`}
              >
                <IssueIcon className="h-3.5 w-3.5" />
                {formatCompactNumber(project.openIssuesCount)} open
              </span>
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

      <GithubProjectDetailTabs project={project} />
    </main>
  );
}
