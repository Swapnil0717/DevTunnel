import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getGithubOpenSourceToolBySlug } from "@/lib/github-open-source-tools/api";
import { RepoLogo } from "@/components/admin/repo-logo";
import { ChevronLeftIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { ContributePageHeader } from "@/components/contribute/contribute-page-header";
import { ContributeTabs } from "@/components/contribute/contribute-tabs";
import { ContributeSidebar } from "@/components/contribute/contribute-sidebar";
import type { ContributeTarget } from "@/lib/contribute/types";

interface GithubToolContributePageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Data-driven metadata (rule 48), same convention every other Contribute
 * route's `generateMetadata` follows — names the actual repository, falls
 * back to "this tool" rather than `undefined` when the fetch hasn't
 * resolved (rule 49). `noIndex: true`, same posture the rest of this
 * `(protected)` route group already takes.
 */
export async function generateMetadata({
  params,
}: GithubToolContributePageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getGithubOpenSourceToolBySlug(slug);
  const name = result.status === "ok" ? result.data.name : "this tool";

  return buildMetadata({
    title: `Contribute to ${name}`,
    description: `Ways to contribute to ${name} — the contribution types this tool takes, and how to get a change merged upstream.`,
    path: `/github-open-source-tools/${slug}/contribute`,
    noIndex: true,
  });
}

/**
 * `/github-open-source-tools/:slug/contribute` — where `ContributeToRepoButton`
 * on the raw GitHub Open Source Tools detail page
 * (`/github-open-source-tools/:slug`) lands.
 *
 * Sibling of `GithubProjectContributePage`
 * (`app/(protected)/github-projects/[slug]/contribute/page.tsx`) — built
 * exactly the same way, reusing `GithubProjectDetail` as its source data
 * (same "identical shape, only the catalog's population differs"
 * reasoning `getGithubOpenSourceToolBySlug` already documents) — and of
 * `ToolContributePage`
 * (`app/(protected)/opensource-tools/[toolSlug]/contribute/page.tsx`), the
 * onboarded Tool's own Contribute page. Same `ContributePageHeader` /
 * `ContributeTabs` / `ContributeSidebar` components every Contribute route
 * shares (rule 51), with the difference carried entirely by the
 * `ContributeTarget` it builds, kind `"github-repo"`
 * (`lib/contribute/types.ts`):
 *
 *  - `tasks` is always `[]` and `projectId` is always `null` — this
 *    repository isn't a DevTunnel project or tool yet, so there's no
 *    `devtunnel.tasks` row and no DevTunnel id for either to exist on
 *    (sql/017). The Tasks tab (`ContributeTasksPanel`) says so directly:
 *    this task will be available once the repository is converted into a
 *    DevTunnel project or tool.
 *  - `viewerIsContributing` is always `false` — there's no join
 *    relationship to have joined yet.
 *
 * Frontend-only, reusing `getGithubOpenSourceToolBySlug` — the exact
 * fetch `/github-open-source-tools/:slug` itself already makes. No new
 * endpoint, no invented field (rule 58).
 *
 * Same three-outcome handling every Contribute route uses: an unknown
 * slug renders Next's real 404 via `notFound()` (rule 25), a network
 * failure degrades to one honest `SectionMessage` with a way back, and
 * otherwise the page renders. Back navigation, breadcrumb, and
 * `detailHref`/`listHref` all point at `/github-open-source-tools`, not
 * `/opensource-tools` — this is the raw catalog's own Contribute page.
 */
export default async function GithubToolContributePage({
  params,
}: GithubToolContributePageProps) {
  const { slug } = await params;
  const result = await getGithubOpenSourceToolBySlug(slug);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href="/github-open-source-tools"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back to Github Open Source Tools
        </Link>
        <h1 className="m-0 mb-6 text-xl font-medium text-text">Contribute</h1>
        <SectionMessage>
          This tool isn&apos;t available right now — check back soon.
        </SectionMessage>
      </main>
    );
  }

  const tool = result.data;

  const target: ContributeTarget = {
    kind: "github-repo",
    slug: tool.slug,
    projectId: null,
    name: tool.name,
    description: tool.description,
    repositoryUrl: tool.repositoryUrl,
    repositoryFullName: tool.repositoryFullName,
    cloneUrl: `${tool.repositoryUrl}.git`,
    techStack: tool.techStack,
    license: tool.license,
    openIssuesCount: tool.openIssuesCount,
    detailHref: `/github-open-source-tools/${tool.slug}`,
    listHref: "/github-open-source-tools",
    listLabel: "Github Open Source Tools",
    viewerIsContributing: false,
    tasks: [],
  };

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <ContributePageHeader
        target={target}
        logo={<RepoLogo repositoryFullName={tool.repositoryFullName} size={56} />}
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
