import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getOpenSourceToolBySlug } from "@/lib/opensource-tools/api";
import { OpenSourceToolLogo } from "@/components/admin/opensource-tools/opensource-tool-logo";
import { ChevronLeftIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { ContributePageHeader } from "@/components/contribute/contribute-page-header";
import { ContributeTabs } from "@/components/contribute/contribute-tabs";
import { ContributeSidebar } from "@/components/contribute/contribute-sidebar";
import type { ContributeTarget } from "@/lib/contribute/types";

interface ToolContributePageProps {
  params: Promise<{ toolSlug: string }>;
}

export async function generateMetadata({ params }: ToolContributePageProps): Promise<Metadata> {
  const { toolSlug } = await params;
  const result = await getOpenSourceToolBySlug(toolSlug);
  const name = result.status === "ok" ? result.data.name : "this tool";

  return buildMetadata({
    title: `Contribute to ${name}`,
    description: `Ways to contribute to ${name} — the contribution types this tool takes, and how to get a change merged upstream.`,
    path: `/opensource-tools/${toolSlug}/contribute`,
    noIndex: true,
  });
}

/**
 * `/opensource-tools/:toolSlug/contribute` — where the **Contribute to
 * this tool** button on the Tool Detail page lands.
 *
 * Same page, same components, same view model as the project route: one
 * Contribute page serving both, rather than two that drift (rule 51). The
 * differences are carried by the `ContributeTarget` it builds, not by a
 * second set of components:
 *
 *  - `tasks` is always `[]`. DevTunnel tasks hang off a project, never a
 *    tool (sql/017) — the Tasks tab says that outright instead of showing
 *    an empty list that looks like a backlog nobody has filled.
 *  - Everything repository-shaped is conditional on `tool.repository`.
 *    A tool whose `sourceUrl` isn't a GitHub repository has no fork to
 *    make and no clone URL, so the workflow tab and the clone card drop
 *    out rather than printing git commands that can't apply.
 *
 * Frontend-only, and reusing `getOpenSourceToolBySlug` — the fetch the
 * tool page already makes. No new endpoint, no invented field (rule 58).
 */
export default async function ToolContributePage({ params }: ToolContributePageProps) {
  const { toolSlug } = await params;
  const result = await getOpenSourceToolBySlug(toolSlug);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href="/opensource-tools"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back to Open Source Tools
        </Link>
        <h1 className="m-0 mb-6 text-xl font-medium text-text">Contribute</h1>
        <SectionMessage>
          This tool isn&apos;t available right now — check back soon.
        </SectionMessage>
      </main>
    );
  }

  const tool = result.data;
  const repository = tool.repository;

  const target: ContributeTarget = {
    kind: "tool",
    slug: tool.slug,
    projectId: null,
    name: tool.name,
    description: tool.description,
    repositoryUrl: repository?.url ?? null,
    repositoryFullName: repository?.fullName ?? null,
    cloneUrl: repository ? `${repository.url}.git` : null,
    techStack: tool.labels,
    license: repository?.license ?? null,
    openIssuesCount: repository?.openIssuesCount ?? null,
    detailHref: `/opensource-tools/${tool.slug}`,
    listHref: "/opensource-tools",
    listLabel: "Open Source Tools",
    viewerIsContributing: tool.viewerIsContributing,
    tasks: [],
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <ContributePageHeader
        target={target}
        logo={<OpenSourceToolLogo name={tool.name} sourceUrl={tool.sourceUrl} size={56} />}
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