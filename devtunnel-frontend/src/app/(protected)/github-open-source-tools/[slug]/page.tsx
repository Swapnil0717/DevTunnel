import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { SITE_URL } from "@/lib/config";
import { getGithubOpenSourceToolBySlug } from "@/lib/github-open-source-tools/api";
import { RepoLogo } from "@/components/admin/repo-logo";
import { ChevronLeftIcon, GitBranchIcon } from "@/components/layout/nav-icons";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { GithubProjectDetailTabs } from "@/components/github-projects/github-project-detail-tabs";
import { GithubProjectSidebar } from "@/components/github-projects/github-project-sidebar";
import { RequestToolOnboardingButton } from "@/components/github-open-source-tools/request-tool-onboarding-button";
import { StarButton } from "@/components/github-open-source-tools/star-button";

interface GithubToolDetailPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Data-driven per rule 48 — describes the actual repository, never a
 * hardcoded string repeated for every slug. Falls back to the generic
 * "Open Source Tool" only when the fetch hasn't resolved to a real name
 * yet, never `undefined` (rule 49). `noIndex: true` — same posture
 * `/github-open-source-tools` itself already takes (this route lives
 * under the `(protected)` group and is a signed-in contributor's view,
 * not public content).
 */
export async function generateMetadata({
  params,
}: GithubToolDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getGithubOpenSourceToolBySlug(slug);
  const title = result.status === "ok" ? result.data.name : "Open Source Tool";

  return buildMetadata({
    title,
    description:
      result.status === "ok"
        ? `${result.data.repositoryFullName} on GitHub — README, open issues, and tool info.`
        : "View this open-source developer tool.",
    path: `/github-open-source-tools/${slug}`,
    noIndex: true,
  });
}

/**
 * `/github-open-source-tools/:slug` — the destination `GithubProjectCard`
 * now links to (via its `basePath` prop, wired in
 * `github-projects-explorer.tsx` and set from
 * `/github-open-source-tools/page.tsx`'s `cardBasePath`) whenever a card
 * is clicked from the Github Open Source Tools grid.
 *
 * Sibling of `GithubProjectDetailPage`
 * (`app/(protected)/github-projects/[slug]/page.tsx`): fetches
 * `GET /github-open-source-tools/:slug`
 * (`lib/github-open-source-tools/api.ts`) server-side and renders it the
 * same way, including the same two-column layout — the tabbed body
 * (`GithubProjectDetailTabs`, reused since a tool's detail shape is
 * identical to a project's: `GithubProjectDetail` — told which catalog
 * it's in via `issuesBasePath`, so its Issues tab's "Load all issues"
 * hits this catalog's own route) on the left, and the
 * same `GithubProjectSidebar` ("About" card, maintainer, clone command,
 * share link) pinned on the right. `tool.owner` was already part of the
 * fetched `GithubProjectDetail` shape but had no home anywhere on this
 * page before the sidebar existed.
 *
 * Header is deliberately slimmer than before: name, the real
 * `repositoryFullName` link, and "Updated <relative time>" — the
 * stars/forks/issues counts that used to live here now live once, in the
 * sidebar, instead of being repeated in two places on the same page.
 *
 * Two actions sit next to the header: "View on GitHub" (unchanged —
 * always the real repository), and "Request to add as DevTunnel project
 * or tool" (`RequestToolOnboardingButton`). Same three-outcome handling
 * `GithubProjectDetailPage` already establishes: a slug that doesn't
 * match any catalog entry renders Next's real 404 via `notFound()`
 * rather than a fabricated "empty tool" page
 * (Frontend_Development_Rules.txt rule 25); a network failure degrades
 * to the illustrated `GithubEmptyState` instead. Back navigation and
 * breadcrumb both point at `/github-open-source-tools`, not
 * `/github-projects` — this is the tools catalog's own detail view.
 */
export default async function GithubToolDetailPage({ params }: GithubToolDetailPageProps) {
  const { slug } = await params;
  const result = await getGithubOpenSourceToolBySlug(slug);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-5xl px-6 py-10">
        <Link
          href="/github-open-source-tools"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back to Github Open Source Tools
        </Link>
        <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
          <Link href="/github-open-source-tools" className="hover:text-accent">
            Github Open Source Tools
          </Link>
          {" / "}
          <span className="text-text-muted">Tool</span>
        </nav>
        <h1 className="m-0 mb-6 text-xl font-medium text-text">Open Source Tool</h1>
        <GithubEmptyState
          variant="no-results"
          title="This tool isn't available right now"
          description="We couldn't reach GitHub for this repository just now. Check back soon, or head back to the full catalog."
          primaryAction={{ label: "Back to Github Open Source Tools", href: "/github-open-source-tools" }}
        />
      </main>
    );
  }

  const tool = result.data;
  const shareUrl = `${SITE_URL}/github-open-source-tools/${tool.slug}`;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link
        href="/github-open-source-tools"
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
        Back to Github Open Source Tools
      </Link>
      <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
        <Link href="/github-open-source-tools" className="hover:text-accent">
          Github Open Source Tools
        </Link>
        {" / "}
        <span className="text-text-muted">{tool.name}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <RepoLogo repositoryFullName={tool.repositoryFullName} size={56} />
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-xl font-medium text-text">{tool.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-text-secondary">
              <a
                href={tool.repositoryUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 font-mono hover:text-accent"
              >
                <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
                {tool.repositoryFullName}
              </a>
              <span aria-hidden="true" className="text-text-faint">
                ·
              </span>
              <span>
                Updated <time dateTime={tool.pushedAt}>{formatRelativeTime(tool.pushedAt)}</time>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={tool.repositoryUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
          >
            <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
            View on GitHub
          </a>
          <StarButton
            slug={tool.slug}
            initialStarredByViewer={tool.isStarredByViewer}
            initialLocalStarCount={tool.localStarCount}
          />
          <RequestToolOnboardingButton slug={tool.slug} />
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <GithubProjectDetailTabs project={tool} issuesBasePath="/github-open-source-tools" />
        </div>
        <GithubProjectSidebar project={tool} shareUrl={shareUrl} />
      </div>
    </main>
  );
}
