import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { JsonLd } from "@/components/seo/json-ld";
import { breadcrumbJsonLd } from "@/lib/structured-data";
import { SITE_URL } from "@/lib/config";
import { getSubmissionBySlug } from "@/lib/submissions/api";
import { RepoLogo } from "@/components/admin/repo-logo";
import { SectionMessage } from "@/components/home/section-message";
import {
  ChevronLeftIcon,
  EditIcon,
  FolderIcon,
  GitBranchIcon,
  ToolIcon,
} from "@/components/layout/nav-icons";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import { SubmissionDetailSidebar } from "@/components/submissions/submission-detail-sidebar";
import { SubmissionUpvoteButton } from "@/components/submissions/submission-upvote-button";
import { getTechTagClasses } from "@/lib/home/tag-style";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import RouteLoading from "./loading";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";

interface SubmissionDetailPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Data-driven per rule 48 — describes the actual submission, never a
 * string repeated for every slug — and never `undefined` (rule 49): it
 * falls back to a generic title only when the fetch didn't resolve.
 * Indexable, because this is public content (rules 2, 16, 27) — but only
 * when the record actually loaded: an unknown slug or a failed fetch
 * renders a bare error message with nothing worth indexing (rule 23), so
 * those responses are `noindex`.
 */
export async function generateMetadata({
  params,
}: SubmissionDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getSubmissionBySlug(slug);

  return buildMetadata({
    title: result.status === "ok" ? result.data.name : "Community submission",
    description:
      result.status === "ok"
        ? `${result.data.name} — a ${result.data.kind === "TOOL" ? "tool" : "project"} submitted to DevTunnel by @${result.data.submittedBy.username}.`
        : "A project or tool submitted to DevTunnel by a contributor.",
    path: `/submissions/${slug}`,
    noIndex: result.status !== "ok",
  });
}

function BackLink() {
  return (
    <Link
      href="/submissions"
      className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
    >
      <ChevronLeftIcon className="h-3.5 w-3.5" />
      Back to Community
    </Link>
  );
}

/**
 * `/submissions/:slug` — the view page for one Community submission:
 * everything DevTunnel holds about it in one place, so nobody has to
 * leave the site to judge whether it's worth opening.
 *
 * Main column, top to bottom: the description(s), the details (type,
 * language, what it replaces, upvotes, tech stack), then the README as it
 * was when the repository was submitted. The right rail
 * (`SubmissionDetailSidebar`) carries who submitted it, the repository's
 * live GitHub numbers and a share link.
 *
 * Two descriptions can exist and both are shown when they do: the
 * submitter's own words and what GitHub returned. The wizard never
 * rewrites the fetched one (`DetailsStep`), so hiding it behind the
 * custom one here would throw away the part a viewer can check.
 *
 * "Edit details" only renders for the person who submitted it
 * (`ownedByViewer`); `/submissions/:slug/edit` and the backend both
 * re-check, so the button is a convenience, not the protection.
 *
 * Same three outcomes every detail page here has: an unknown slug is
 * Next's real 404 via `notFound()` (rule 25), and a failed fetch says so
 * instead of showing an empty page.
 */
export default async function SubmissionDetailPage({ params }: SubmissionDetailPageProps) {
  const { slug } = await params;
  const result = await getSubmissionBySlug(slug);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <BlueprintReveal skeleton={<RouteLoading />}>
        <main className="mx-auto max-w-5xl px-6 py-10">
          <BackLink />
          <h1 className="m-0 mb-6 text-xl font-medium text-text">Community submission</h1>
          <SectionMessage>
            We couldn&apos;t load this submission just now. Check back soon, or head back to the
            full list.
          </SectionMessage>
        </main>
      </BlueprintReveal>
    );
  }

  const submission = result.data;
  const KindIcon = submission.kind === "TOOL" ? ToolIcon : FolderIcon;
  const kindLabel = submission.kind === "TOOL" ? "Tool" : "Project";
  const shareUrl = `${SITE_URL}/submissions/${submission.slug}`;

  const hasCustomDescription =
    submission.descriptionSource === "CUSTOM" && Boolean(submission.customDescription);

  return (
    <BlueprintReveal skeleton={<RouteLoading />}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <BackLink />
        <JsonLd
          data={breadcrumbJsonLd([
            { name: "Community", path: "/submissions" },
            { name: submission.name, path: `/submissions/${slug}` },
          ])}
        />
        <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
          <Link href="/submissions" className="hover:text-accent">
            Community
          </Link>
          {" / "}
          <span className="text-text-muted">{submission.name}</span>
        </nav>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <RepoLogo repositoryFullName={submission.repositoryFullName ?? ""} size={56} />
            <div className="flex flex-col gap-1.5">
              <h1 className="m-0 text-xl font-medium text-text">{submission.name}</h1>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-text-secondary">
                <span className="inline-flex items-center gap-1 text-text-faint">
                  <KindIcon className="h-3.5 w-3.5 shrink-0" />
                  {kindLabel}
                </span>
                {submission.repositoryFullName ? (
                  <>
                    <span aria-hidden="true" className="text-text-faint">
                      ·
                    </span>
                    <a
                      href={submission.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 font-mono hover:text-accent"
                    >
                      <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
                      {submission.repositoryFullName}
                    </a>
                  </>
                ) : null}
                <span aria-hidden="true" className="text-text-faint">
                  ·
                </span>
                <span>
                  Submitted{" "}
                  <time dateTime={submission.createdAt}>
                    {formatRelativeTime(submission.createdAt)}
                  </time>
                </span>
              </div>
              {submission.isPaidAlternative ? (
                <span className="w-fit rounded-[5px] border border-tag-interest-border bg-tag-interest-bg px-[7px] py-[2px] text-[10.5px] text-tag-interest-text">
                  Alternative to {submission.alternativeTo.join(", ")}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <a
              href={submission.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
            >
              <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
              View on GitHub
            </a>
            <SubmissionUpvoteButton
              slug={submission.slug}
              name={submission.name}
              initialUpvoted={submission.upvotedByViewer}
              initialCount={submission.upvoteCount}
            />
            {submission.ownedByViewer ? (
              <Link
                href={`/submissions/${submission.slug}/edit`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-accent px-3.5 py-2 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90"
              >
                <EditIcon className="h-3.5 w-3.5 shrink-0" />
                Edit details
              </Link>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="rounded-[10px] border border-border bg-surface p-5">
              <h2 className="m-0 mb-3 text-[11px] font-normal uppercase tracking-wide text-text-faint">
                About
              </h2>

              {hasCustomDescription ? (
                <>
                  <p className="m-0 mb-1 text-[11px] text-text-faint">
                    From @{submission.submittedBy.username}
                  </p>
                  <p className="m-0 whitespace-pre-line text-[13px] leading-relaxed text-text-secondary">
                    {submission.customDescription}
                  </p>
                  {submission.fetchedDescription ? (
                    <div className="mt-4 border-t border-border-subtle pt-4">
                      <p className="m-0 mb-1 text-[11px] text-text-faint">From GitHub</p>
                      <p className="m-0 text-[13px] leading-relaxed text-text-secondary">
                        {submission.fetchedDescription}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : submission.fetchedDescription ? (
                <>
                  <p className="m-0 mb-1 text-[11px] text-text-faint">From GitHub</p>
                  <p className="m-0 text-[13px] leading-relaxed text-text-secondary">
                    {submission.fetchedDescription}
                  </p>
                </>
              ) : (
                <p className="m-0 text-[13px] text-text-faint">No description on the repository.</p>
              )}
            </section>

            <section className="rounded-[10px] border border-border bg-surface p-5">
              <h2 className="m-0 mb-3 text-[11px] font-normal uppercase tracking-wide text-text-faint">
                Details
              </h2>
              <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-[140px_1fr]">
                <span className="text-text-faint">Type</span>
                <span className="text-text-secondary">{kindLabel}</span>

                <span className="text-text-faint">Primary language</span>
                <span className="text-text-secondary">{submission.primaryLanguage ?? "—"}</span>

                <span className="text-text-faint">Alternative to</span>
                <span className="text-text-secondary">
                  {submission.isPaidAlternative
                    ? submission.alternativeTo.join(", ")
                    : "Not listed as an alternative to paid software"}
                </span>

                <span className="text-text-faint">Upvotes</span>
                <span className="text-text-secondary">
                  {submission.upvoteCount.toLocaleString()} in total ·{" "}
                  {submission.recentUpvoteCount.toLocaleString()} in the last 7 days
                </span>

                <span className="text-text-faint">Source</span>
                <a
                  href={submission.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="min-w-0 truncate text-text-secondary hover:text-accent"
                >
                  {submission.sourceUrl}
                </a>
              </div>

              {submission.techStack.length > 0 ? (
                <div className="mt-4 border-t border-border-subtle pt-4">
                  <h3 className="m-0 mb-2 text-[11px] uppercase tracking-wide text-text-faint">
                    Tech stack
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {submission.techStack.map((tag) => (
                      <span
                        key={tag}
                        className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10.5px] ${getTechTagClasses(tag)}`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-[10px] border border-border bg-surface p-5">
              <h2 className="m-0 mb-3 text-[11px] font-normal uppercase tracking-wide text-text-faint">
                README
              </h2>
              {submission.readme ? (
                <MarkdownReadme content={submission.readme} sourceUrl={submission.sourceUrl} />
              ) : (
                <p className="m-0 text-[13px] text-text-faint">
                  This repository had no README when it was submitted.{" "}
                  <a
                    href={submission.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-accent hover:underline"
                  >
                    View it on GitHub
                  </a>
                  .
                </p>
              )}
            </section>
          </div>

          <SubmissionDetailSidebar submission={submission} shareUrl={shareUrl} />
        </div>
      </main>
    </BlueprintReveal>
  );
}
