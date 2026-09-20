import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd } from "@/lib/structured-data";
import { SITE_URL } from "@/lib/config";
import { getDevtunnelProjectBySlug } from "@/lib/projects/api";
import { DevtunnelProjectLogo } from "@/components/projects/devtunnel-project-logo";
import { AdminProjectStatusBadge } from "@/components/admin/projects/admin-project-status-badge";
import { ChevronLeftIcon, GitBranchIcon } from "@/components/layout/nav-icons";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { SectionMessage } from "@/components/home/section-message";
import { ProjectDetailTabs } from "@/components/projects/project-detail-tabs";
import { ProjectDetailSidebar } from "@/components/projects/project-detail-sidebar";
import { ProjectStarButton } from "@/components/projects/project-star-button";
import { ContributeButton } from "@/components/projects/contribute-button";

interface ProjectDetailPageProps {
  params: Promise<{ projectSlug: string }>;
}

/**
 * Data-driven per rule 48 — describes the actual project, never a
 * hardcoded string repeated for every slug. Falls back to the generic
 * "Project" only when the fetch hasn't resolved to a real name yet, never
 * `undefined` (rule 49). Indexable, because this is public content (rules 2, 16, 27) — but only
 * when the record actually loaded: an unknown slug or a failed fetch
 * renders a bare error message with nothing worth indexing (rule 23), so
 * those responses are `noindex`.
 */
export async function generateMetadata({
  params,
}: ProjectDetailPageProps): Promise<Metadata> {
  const { projectSlug } = await params;
  const result = await getDevtunnelProjectBySlug(projectSlug);
  const title = result.status === "ok" ? result.data.name : "Project";

  return buildMetadata({
    title,
    description:
      result.status === "ok"
        ? `${result.data.name} on DevTunnel — project info, README, open tasks and issues.`
        : "View this DevTunnel project.",
    path: `/projects/${projectSlug}`,
    noIndex: result.status !== "ok",
  });
}

/**
 * `/projects/:projectSlug` — the "View project" destination
 * `DevtunnelProjectCard` (`components/projects/devtunnel-project-card.tsx`)
 * and `ProjectCard` (`components/home/project-card.tsx`) have linked to
 * since `/projects` shipped, but which had no route behind it until now
 * (the same gap `/github-projects/:slug` filled for its own cards).
 *
 * Distinct from `/github-projects/:slug`: that page describes a raw
 * GitHub repository nobody has onboarded, so the only thing to do with it
 * is star it or nominate it. This describes a project DevTunnel has
 * onboarded, so the page's job is to get a contributor from "what is
 * this?" to actually working on it — which is why **Contribute to this
 * project** is the one accent-colored button here, and why the body has a
 * Tasks tab the GitHub-catalog page has no equivalent for.
 *
 * Two-column layout, same shape GitHub's own repository page uses and the
 * same one `/github-projects/:slug` already establishes in this app: the
 * tabbed body (Project Info / README / Tasks / All Issues) on the left,
 * and a persistent project rail on the right carrying the "About" facts,
 * the maintainer, the clone command and a share link — rather than making
 * every fact compete for room inside one tab. On narrow screens the rail
 * stacks underneath the tabs instead of squeezing beside them.
 *
 * The header stays slim on purpose: logo, name, repository link, status
 * and last activity. The stars/forks/issues/contributor counts live once,
 * in the rail, instead of being repeated in two places on the same page.
 *
 * Three outcomes, the same split `TaskDetailPage` and
 * `GithubProjectDetailPage` already use: a slug matching nothing renders
 * Next's real 404 via `notFound()` rather than a fabricated empty project
 * (Frontend_Development_Rules.txt rule 25); a network failure degrades to
 * one honest `SectionMessage` with a way back to the list; otherwise the
 * real page renders.
 */
export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectSlug } = await params;
  const result = await getDevtunnelProjectBySlug(projectSlug);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href="/projects"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back to Projects
        </Link>
        <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
          <Link href="/projects" className="hover:text-accent">
            Projects
          </Link>
          {" / "}
          <span className="text-text-muted">Project</span>
        </nav>
        <h1 className="m-0 mb-6 text-xl font-medium text-text">Project</h1>
        <SectionMessage>
          This project isn&apos;t available right now — check back soon.
        </SectionMessage>
      </main>
    );
  }

  const project = result.data;
  const shareUrl = `${SITE_URL}/projects/${project.slug}`;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
        Back to Projects
      </Link>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Projects", path: "/projects" },
          { name: project.name, path: `/projects/${project.slug}` },
        ])}
      />
      <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
        <Link href="/projects" className="hover:text-accent">
          Projects
        </Link>
        {" / "}
        <span className="text-text-muted">{project.name}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <DevtunnelProjectLogo repositoryFullName={project.repositoryFullName} size={56} />
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
              <AdminProjectStatusBadge status={project.status} />
              <span aria-hidden="true" className="text-text-faint">
                ·
              </span>
              <span>
                Updated{" "}
                <time dateTime={project.pushedAt}>{formatRelativeTime(project.pushedAt)}</time>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <ContributeButton
            slug={project.slug}
            initialIsContributing={project.viewerIsContributing}
            taskCount={project.taskCount}
          />
          <ProjectStarButton
            slug={project.slug}
            initialStarredByViewer={project.isStarredByViewer}
            initialLocalStarCount={project.localStarCount}
          />
          <a
            href={project.repositoryUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
          >
            <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
            View on GitHub
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <ProjectDetailTabs project={project} />
        </div>
        <ProjectDetailSidebar project={project} shareUrl={shareUrl} />
      </div>
    </main>
  );
}
