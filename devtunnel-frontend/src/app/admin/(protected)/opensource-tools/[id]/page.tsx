import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getAdminOpenSourceToolDetail } from "@/lib/admin/opensource-tools/api";
import { OpenSourceToolLogo } from "@/components/admin/opensource-tools/opensource-tool-logo";
import { DeleteOpenSourceToolButton } from "@/components/admin/opensource-tools/delete-opensource-tool-button";
import { EditOpenSourceToolDetailsPanel } from "@/components/admin/opensource-tools/edit-opensource-tool-details-panel";
import { GitBranchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { MarkdownReadme } from "@/components/ui/markdown-readme";

interface OpenSourceToolDetailPageProps {
  params: { id: string };
  /**
   * `?edit=1` opens the Description/Labels/Setup guide panel straight
   * into edit mode — what the `/admin/opensource-tools` grid card's
   * "Edit" action links to, same convention the Project Detail page
   * uses for its own table's "Edit" row action.
   */
  searchParams?: { edit?: string };
}

/**
 * Data-driven per rule 48 — title/description describe the actual tool,
 * never a hardcoded string repeated for every id. Falls back to the
 * generic "Open Source Tool" only when the fetch hasn't resolved to a
 * real name yet (not-found / error), never `undefined` (rule 49).
 * `noIndex: true` — this is private Admin Portal UI, not public content
 * (Frontend_Development_Rules.txt rule 18).
 */
export async function generateMetadata({
  params,
}: OpenSourceToolDetailPageProps): Promise<Metadata> {
  const result = await getAdminOpenSourceToolDetail(params.id);
  const name = result.status === "ok" ? result.data.name : "Open Source Tool";

  return buildMetadata({
    title: name,
    description: `Manage the ${name} listing in the DevTunnel Open Source Tools catalog.`,
    path: `/admin/opensource-tools/${params.id}`,
    noIndex: true,
  });
}

/**
 * `/admin/opensource-tools/:id` — the "View" destination for a card on
 * the `/admin/opensource-tools` grid (also reachable by clicking the
 * card's logo or name). Fetches `GET /admin/opensource-tools/:id`
 * server-side and renders the tool's source, primary language, labels,
 * setup guide and README. That endpoint isn't built on the backend yet
 * (see `lib/admin/opensource-tools/api.ts`), so — same convention as the
 * Project Detail page — a failed fetch degrades to one honest
 * `SectionMessage`, and an unknown id renders Next's real 404 via
 * `notFound()` rather than a fabricated "empty tool" page
 * (Frontend_Development_Rules.txt rule 25).
 *
 * The README is rendered GitHub-style via `MarkdownReadme`, same as the
 * Project Detail page and the onboarding wizard's own Description /
 * Preview steps — parsed to React elements, never
 * `dangerouslySetInnerHTML` (rule 20).
 */
export default async function AdminOpenSourceToolDetailPage({
  params,
  searchParams,
}: OpenSourceToolDetailPageProps) {
  const result = await getAdminOpenSourceToolDetail(params.id);
  const startInEditMode = searchParams?.edit === "1";

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
          <Link href="/admin/opensource-tools" className="hover:text-accent">
            Open Source Tools
          </Link>
          {" / "}
          <span className="text-text-muted">Tool</span>
        </nav>
        <h1 className="m-0 mb-4 text-xl font-medium text-text">Open Source Tool</h1>
        <SectionMessage>
          This tool isn&apos;t available right now — check back soon.
        </SectionMessage>
      </main>
    );
  }

  const tool = result.data;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
        <Link href="/admin/opensource-tools" className="hover:text-accent">
          Open Source Tools
        </Link>
        {" / "}
        <span className="text-text-muted">{tool.name}</span>
      </nav>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <OpenSourceToolLogo name={tool.name} sourceUrl={tool.sourceUrl} size={56} />
          <div>
            <h1 className="m-0 mb-1.5 text-xl font-medium text-text">{tool.name}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-text-secondary">
              <a
                href={tool.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 font-mono hover:text-accent"
              >
                <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
                {tool.sourceUrl}
              </a>
              {tool.primaryLanguage ? (
                <>
                  <span aria-hidden="true" className="text-text-faint">
                    ·
                  </span>
                  <span>{tool.primaryLanguage}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={tool.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
          >
            View source
          </a>
          <DeleteOpenSourceToolButton
            toolId={tool.id}
            toolName={tool.name}
            variant="button"
            redirectTo="/admin/opensource-tools"
          />
        </div>
      </div>

      <EditOpenSourceToolDetailsPanel tool={tool} startInEditMode={startInEditMode} />

      <section
        aria-labelledby="tool-readme-heading"
        className="rounded-[10px] border border-border bg-surface p-5"
      >
        <h2
          id="tool-readme-heading"
          className="m-0 mb-2 text-[11px] uppercase tracking-wide text-text-faint"
        >
          README
        </h2>
        <div className="max-h-[420px] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-4">
          {tool.readme ? (
            <MarkdownReadme content={tool.readme} />
          ) : (
            <p className="m-0 text-[12px] text-text-faint">No README found.</p>
          )}
        </div>
      </section>
    </main>
  );
}
