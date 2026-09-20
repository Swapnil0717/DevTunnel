import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd } from "@/lib/structured-data";
import { SITE_URL } from "@/lib/config";
import { getOpenSourceToolBySlug } from "@/lib/opensource-tools/api";
import { OpenSourceToolLogo } from "@/components/admin/opensource-tools/opensource-tool-logo";
import { ChevronLeftIcon, GitBranchIcon } from "@/components/layout/nav-icons";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { SectionMessage } from "@/components/home/section-message";
import { ToolDetailTabs } from "@/components/opensource-tools/tool-detail-tabs";
import { ToolDetailSidebar } from "@/components/opensource-tools/tool-detail-sidebar";
import { ToolStarButton } from "@/components/opensource-tools/tool-star-button";
import { ContributeToToolButton } from "@/components/opensource-tools/contribute-to-tool-button";

interface ToolDetailPageProps {
  params: Promise<{ toolSlug: string }>;
}

/** Strips the protocol and any trailing slash — same helper `DevtunnelOpenSourceToolCard` uses. */
function formatSourceUrl(sourceUrl: string): string {
  return sourceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Data-driven per rule 48 — describes the actual tool, never a hardcoded
 * string repeated for every slug. Falls back to the generic "Tool" only
 * when the fetch hasn't resolved to a real name yet, never `undefined`
 * (rule 49). Indexable, because this is public content (rules 2, 16, 27) — but only
 * when the record actually loaded: an unknown slug or a failed fetch
 * renders a bare error message with nothing worth indexing (rule 23), so
 * those responses are `noindex`.
 */
export async function generateMetadata({ params }: ToolDetailPageProps): Promise<Metadata> {
  const { toolSlug } = await params;
  const result = await getOpenSourceToolBySlug(toolSlug);
  const title = result.status === "ok" ? result.data.name : "Tool";

  return buildMetadata({
    title,
    description:
      result.status === "ok"
        ? `${result.data.name} on DevTunnel — what it does, how to set it up, and where to help.`
        : "View this open source tool on DevTunnel.",
    path: `/opensource-tools/${toolSlug}`,
    noIndex: result.status !== "ok",
  });
}

/**
 * `/opensource-tools/:toolSlug` — the detail page for a tool DevTunnel
 * has curated, and the destination `DevtunnelOpenSourceToolCard` should
 * now link to instead of sending every click straight out to the tool's
 * own site (its doc comment notes it only links out "because no
 * `/opensource-tools/:slug` page exists" — this is that page).
 *
 * Deliberately the same layout as `/projects/:projectSlug`: slim header,
 * one accent-colored primary action, tabbed body on the left, persistent
 * rail on the right, rail stacking underneath on narrow screens. Two
 * things differ, and both are because a tool genuinely isn't a project:
 * the Tasks tab is a Setup Guide tab (there are no DevTunnel tasks on a
 * tool — see `ToolDetailTabs`), and everything GitHub-shaped is
 * conditional on the tool actually having a repository behind it, since
 * `devtunnel.opensource_tools` stores a `source_url`, not a repo
 * (sql/017). A tool with no repository shows no Star button, no clone
 * command, and no maintainer card, rather than empty ones.
 *
 * Three outcomes, same split as every other detail page here: unknown
 * slug renders Next's real 404 (rule 25), a network failure degrades to
 * one honest `SectionMessage`, otherwise the real page renders.
 */
export default async function ToolDetailPage({ params }: ToolDetailPageProps) {
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
        <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
          <Link href="/opensource-tools" className="hover:text-accent">
            Open Source Tools
          </Link>
          {" / "}
          <span className="text-text-muted">Tool</span>
        </nav>
        <h1 className="m-0 mb-6 text-xl font-medium text-text">Tool</h1>
        <SectionMessage>
          This tool isn&apos;t available right now — check back soon.
        </SectionMessage>
      </main>
    );
  }

  const tool = result.data;
  const shareUrl = `${SITE_URL}/opensource-tools/${tool.slug}`;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href="/opensource-tools"
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
        Back to Open Source Tools
      </Link>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Open Source Tools", path: "/opensource-tools" },
          { name: tool.name, path: `/opensource-tools/${tool.slug}` },
        ])}
      />
      <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
        <Link href="/opensource-tools" className="hover:text-accent">
          Open Source Tools
        </Link>
        {" / "}
        <span className="text-text-muted">{tool.name}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <OpenSourceToolLogo name={tool.name} sourceUrl={tool.sourceUrl} size={56} />
          <div className="flex flex-col gap-1.5">
            <h1 className="m-0 text-xl font-medium text-text">{tool.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-text-secondary">
              <a
                href={tool.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 font-mono hover:text-accent"
              >
                <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
                {formatSourceUrl(tool.sourceUrl)}
              </a>
              <span aria-hidden="true" className="text-text-faint">
                ·
              </span>
              <span>
                Added <time dateTime={tool.createdAt}>{formatRelativeTime(tool.createdAt)}</time>
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-2">
          <ContributeToToolButton
            slug={tool.slug}
            initialIsContributing={tool.viewerIsContributing}
            repositoryUrl={tool.repository?.url ?? null}
          />
          {/* Starring is a GitHub action — nothing to star on a tool that isn't a repository. */}
          {tool.repository ? (
            <ToolStarButton
              slug={tool.slug}
              initialStarredByViewer={tool.isStarredByViewer}
              initialLocalStarCount={tool.localStarCount}
            />
          ) : null}
          <a
            href={tool.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
          >
            <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
            {tool.repository ? "View on GitHub" : "Visit tool"}
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <ToolDetailTabs tool={tool} />
        </div>
        <ToolDetailSidebar tool={tool} shareUrl={shareUrl} />
      </div>
    </main>
  );
}
