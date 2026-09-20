import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getGithubProjectBySlug } from "@/lib/github-projects/api";
import { RepoLogo } from "@/components/admin/repo-logo";
import { ChevronLeftIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { ContributePageHeader } from "@/components/contribute/contribute-page-header";
import { ContributeTabs } from "@/components/contribute/contribute-tabs";
import { ContributeSidebar } from "@/components/contribute/contribute-sidebar";
import type { ContributeTarget } from "@/lib/contribute/types";

interface GithubProjectContributePageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Data-driven metadata (rule 48), same convention every other Contribute
 * route's `generateMetadata` follows — names the actual repository, falls
 * back to "this repository" rather than `undefined` when the fetch hasn't
 * resolved (rule 49). `noindex,follow`: the contribution guide is largely the same generic
 * content for every project or tool (rule 24), so the canonical,
 * indexable page is the project/tool itself; this one stays reachable
 * and crawlable but out of results.
 */
export async function generateMetadata({
  params,
}: GithubProjectContributePageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getGithubProjectBySlug(slug);
  const name = result.status === "ok" ? result.data.name : "this repository";

  return buildMetadata({
    title: `Contribute to ${name}`,
    description: `Ways to contribute to ${name} — the contribution types this repository takes, and how to get a change merged upstream.`,
    path: `/github-projects/${slug}/contribute`,
    noIndex: true,
    followLinks: true,
  });
}

/**
 * `/github-projects/:slug/contribute` — where `ContributeToRepoButton` on
 * the raw GitHub Project detail page (`/github-projects/:slug`) lands.
 *
 * Sibling of `ProjectContributePage`
 * (`app/(public)/projects/[projectSlug]/contribute/page.tsx`) and
 * `ToolContributePage`
 * (`app/(public)/opensource-tools/[toolSlug]/contribute/page.tsx`):
 * same page, same `ContributePageHeader`/`ContributeTabs`/`ContributeSidebar`
 * components, same view-model pattern (rule 51 — one Contribute page
 * serving all three, not three that drift). The difference is carried
 * entirely by the `ContributeTarget` it builds, kind `"github-repo"`
 * (`lib/contribute/types.ts`):
 *
 *  - `tasks` is always `[]` and `projectId` is always `null` — this
 *    repository isn't a DevTunnel project or tool yet, so there's no
 *    `devtunnel.tasks` row and no DevTunnel id for either to exist on
 *    (sql/017). The Tasks tab (`ContributeTasksPanel`) says so directly,
 *    with the fix being "convert this into a DevTunnel project or tool",
 *    not "go find a different one".
 *  - `viewerIsContributing` is always `false` — there's no join
 *    relationship to have joined yet (`ContributeToRepoButton` doesn't
 *    call a join endpoint the way `ContributeButton` does, precisely
 *    because none exists for a raw catalog entry).
 *
 * Frontend-only, and reusing `getGithubProjectBySlug` — the exact fetch
 * `/github-projects/:slug` itself already makes. No new endpoint, no
 * invented field (rule 58).
 *
 * Same three-outcome handling every Contribute route uses: an unknown
 * slug renders Next's real 404 via `notFound()` (rule 25), a network
 * failure degrades to one honest `SectionMessage` with a way back, and
 * otherwise the page renders. Back navigation, breadcrumb, and
 * `detailHref`/`listHref` all point at `/github-projects`, not
 * `/projects` — this is the raw catalog's own Contribute page.
 */
export default async function GithubProjectContributePage({
  params,
}: GithubProjectContributePageProps) {
  const { slug } = await params;
  const result = await getGithubProjectBySlug(slug);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href="/github-projects"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back to GitHub Projects
        </Link>
        <h1 className="m-0 mb-6 text-xl font-medium text-text">Contribute</h1>
        <SectionMessage>
          This repository isn&apos;t available right now — check back soon.
        </SectionMessage>
      </main>
    );
  }

  const project = result.data;

  const target: ContributeTarget = {
    kind: "github-repo",
    slug: project.slug,
    projectId: null,
    name: project.name,
    description: project.description,
    repositoryUrl: project.repositoryUrl,
    repositoryFullName: project.repositoryFullName,
    cloneUrl: `${project.repositoryUrl}.git`,
    techStack: project.techStack,
    license: project.license,
    openIssuesCount: project.openIssuesCount,
    detailHref: `/github-projects/${project.slug}`,
    listHref: "/github-projects",
    listLabel: "GitHub Projects",
    viewerIsContributing: false,
    tasks: [],
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <ContributePageHeader
        target={target}
        logo={<RepoLogo repositoryFullName={project.repositoryFullName} size={56} />}
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
