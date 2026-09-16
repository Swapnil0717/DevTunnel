import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getGithubOpenSourceToolBySlug } from "@/lib/github-open-source-tools/api";
import { RepoLogo } from "@/components/admin/repo-logo";
import { ChevronLeftIcon, GitBranchIcon, StarIcon, IssueIcon } from "@/components/layout/nav-icons";
import { formatCompactNumber } from "@/lib/github-projects/format-compact-number";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { SectionMessage } from "@/components/home/section-message";
import { GithubProjectDetailTabs } from "@/components/github-projects/github-project-detail-tabs";
import { RequestToolOnboardingButton } from "@/components/github-open-source-tools/request-tool-onboarding-button";
import { StarButton } from "@/components/github-open-source-tools/star-button";

interface GithubToolDetailPageProps {
  params: { slug: string };
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
  const result = await getGithubOpenSourceToolBySlug(params.slug);
  const title = result.status === "ok" ? result.data.name : "Open Source Tool";

  return buildMetadata({
    title,
    description:
      result.status === "ok"
        ? `${result.data.repositoryFullName} on GitHub — README, open issues, and tool info.`
        : "View this open-source developer tool.",
    path: `/github-open-source-tools/${params.slug}`,
    noIndex: true,
  });
}

/**
 * `/github-open-source-tools/:slug` — the destination `GithubProjectCard`
 * now links to (via its `basePath` prop, wired in
 * `github-projects-explorer.tsx` and set from
 * `/github-open-source-tools/page.tsx`'s `cardBasePath`) whenever a card
 * is clicked anywhere — logo, name, description, tag row, all of it —
 * from the Github Open Source Tools grid, instead of opening straight
 * out to GitHub or (previously) landing on the unrelated GitHub Projects
 * detail route.
 *
 * Sibling of `GithubProjectDetailPage`
 * (`app/(protected)/github-projects/[slug]/page.tsx`): fetches
 * `GET /github-open-source-tools/:slug`
 * (`lib/github-open-source-tools/api.ts`) server-side and renders the
 * repository the same way — identity and stats up top, then
 * Project Info / README / Issues as tabs (`GithubProjectDetailTabs`,
 * reused as-is since a tool's detail shape is identical to a project's:
 * `GithubProjectDetail`) so all three live on one page without a wall of
 * scrolling.
 *
 * Two actions sit next to the header: "View on GitHub" (unchanged —
 * always the real repository), and "Request to add as DevTunnel project
 * or tool" (`RequestToolOnboardingButton`) — a contributor-facing way to
 * flag a repository they think is worth an Admin running the full
 * onboarding flow on (as either a DevTunnel Project or an Open Source
 * Tool), without needing Admin access themselves or leaving this page.
 *
 * Same three-outcome handling `GithubProjectDetailPage` already
 * establishes: a slug that doesn't match any catalog entry renders
 * Next's real 404 via `notFound()` rather than a fabricated "empty tool"
 * page (Frontend_Development_Rules.txt rule 25); a network failure
 * degrades to one honest `SectionMessage` instead. Back navigation and
 * breadcrumb both point at `/github-open-source-tools`, not
 * `/github-projects` — this is the tools catalog's own detail view.
 */
export default async function GithubToolDetailPage({ params }: GithubToolDetailPageProps) {
  const result = await getGithubOpenSourceToolBySlug(params.slug);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
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
        <h1 className="m-0 mb-4 text-xl font-medium text-text">Open Source Tool</h1>
        <SectionMessage>This tool isn&apos;t available right now — check back soon.</SectionMessage>
      </main>
    );
  }

  const tool = result.data;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
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

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
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
              <span
                className="inline-flex items-center gap-1"
                aria-label={`${tool.stars.toLocaleString()} stars`}
              >
                <StarIcon className="h-3.5 w-3.5" />
                {formatCompactNumber(tool.stars)}
              </span>
              <span aria-hidden="true" className="text-text-faint">
                ·
              </span>
              <span
                className="inline-flex items-center gap-1"
                aria-label={`${tool.openIssuesCount.toLocaleString()} open issues`}
              >
                <IssueIcon className="h-3.5 w-3.5" />
                {formatCompactNumber(tool.openIssuesCount)} open
              </span>
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

      <GithubProjectDetailTabs project={tool} />
    </main>
  );
}
