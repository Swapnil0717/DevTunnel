import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getDevtunnelProjectBySlug } from "@/lib/projects/api";
import { DevtunnelProjectLogo } from "@/components/projects/devtunnel-project-logo";
import { ChevronLeftIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { ContributePageHeader } from "@/components/contribute/contribute-page-header";
import { ContributeTabs } from "@/components/contribute/contribute-tabs";
import { ContributeSidebar } from "@/components/contribute/contribute-sidebar";
import type { ContributeTarget } from "@/lib/contribute/types";

interface ContributePageProps {
  params: Promise<{ projectSlug: string }>;
}

/**
 * Data-driven metadata (rule 48) — names the actual project, never a
 * string repeated for every slug, and falls back to "this project"
 * rather than `undefined` when the fetch didn't resolve (rule 49).
 * `noindex,follow`: the contribution guide is largely the same generic
 * content for every project or tool (rule 24), so the canonical,
 * indexable page is the project/tool itself; this one stays reachable
 * and crawlable but out of results.
 */
export async function generateMetadata({ params }: ContributePageProps): Promise<Metadata> {
  const { projectSlug } = await params;
  const result = await getDevtunnelProjectBySlug(projectSlug);
  const name = result.status === "ok" ? result.data.name : "this project";

  return buildMetadata({
    title: `Contribute to ${name}`,
    description: `Ways to contribute to ${name} on DevTunnel — open tasks, the contribution types this project takes, and how to get a pull request merged.`,
    path: `/projects/${projectSlug}/contribute`,
    noIndex: true,
    followLinks: true,
  });
}

/**
 * `/projects/:projectSlug/contribute` — where the **Contribute to this
 * project** button on the View Project page lands.
 *
 * Before this route existed, that button joined the project and then left
 * the contributor on the same page with a one-line "you're in, pick
 * something from the Tasks tab" message — the moment someone is most
 * ready to act, answered with a sentence pointing at a tab. This page is
 * that next step made real: the project's DevTunnel tasks, the kinds of
 * contribution the project can take (code and otherwise), and the actual
 * fork-to-pull-request flow.
 *
 * Frontend-only. It re-uses `getDevtunnelProjectBySlug` — the same fetch
 * the project page already makes — and derives a `ContributeTarget` view
 * model from it (`lib/contribute/types.ts`), so nothing here needs a new
 * endpoint or invents a field the backend doesn't return (rule 58). The
 * tasks shown are exactly `project.tasks`; the ways-to-contribute catalog
 * is static content, not a claim about what this project needs.
 *
 * Same three outcomes every detail route in this app uses: an unknown
 * slug renders Next's real 404 via `notFound()` (rule 25), a network
 * failure degrades to one honest `SectionMessage` with a way back, and
 * otherwise the page renders.
 *
 * Note it does *not* gate on `viewerIsContributing`. Someone who hasn't
 * joined can still read how to contribute — the join action belongs to
 * the project page, and turning this into a members-only page would hide
 * the information most likely to make someone want to join.
 */
export default async function ProjectContributePage({ params }: ContributePageProps) {
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
        <h1 className="m-0 mb-6 text-xl font-medium text-text">Contribute</h1>
        <SectionMessage>
          This project isn&apos;t available right now — check back soon.
        </SectionMessage>
      </main>
    );
  }

  const project = result.data;

  const target: ContributeTarget = {
    kind: "project",
    slug: project.slug,
    projectId: project.id,
    name: project.name,
    description: project.description,
    repositoryUrl: project.repositoryUrl,
    repositoryFullName: project.repositoryFullName,
    cloneUrl: `${project.repositoryUrl}.git`,
    techStack: project.techStack,
    license: project.license,
    openIssuesCount: project.openIssuesCount,
    detailHref: `/projects/${project.slug}`,
    listHref: "/projects",
    listLabel: "Projects",
    viewerIsContributing: project.viewerIsContributing,
    tasks: project.tasks,
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <ContributePageHeader
        target={target}
        logo={
          <DevtunnelProjectLogo repositoryFullName={project.repositoryFullName} size={56} />
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <ContributeTabs target={target} />
        </div>
        <ContributeSidebar target={target} />
      </div>
    </main>
  );
}