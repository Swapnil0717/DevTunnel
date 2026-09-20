import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getSubmissionBySlug } from "@/lib/submissions/api";
import { RepoLogo } from "@/components/admin/repo-logo";
import { SectionMessage } from "@/components/home/section-message";
import { ChevronLeftIcon } from "@/components/layout/nav-icons";
import { EditSubmissionForm } from "@/components/submissions/edit-submission-form";

interface EditSubmissionPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: EditSubmissionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getSubmissionBySlug(slug);

  return buildMetadata({
    title: result.status === "ok" ? `Edit ${result.data.name}` : "Edit submission",
    description: "Edit the details of a project or tool you submitted to DevTunnel.",
    path: `/submissions/${slug}/edit`,
    noIndex: true,
  });
}

/**
 * `/submissions/:slug/edit` — edit a submission's details.
 *
 * Only the person who submitted it can be here. A signed-in visitor who
 * isn't the owner (a shared link, a hand-typed URL) is sent to the view
 * page rather than shown a form that could only fail on save; the
 * backend refuses the write with a 403 regardless, so this redirect is
 * about not showing a dead end, not about security.
 *
 * Unknown slug is Next's real 404, and a failed fetch says so rather than
 * rendering an empty form that would save over nothing (rule 25).
 */
export default async function EditSubmissionPage({ params }: EditSubmissionPageProps) {
  const { slug } = await params;
  const result = await getSubmissionBySlug(slug);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link
          href="/submissions"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back to Community
        </Link>
        <h1 className="m-0 mb-6 text-xl font-medium text-text">Edit submission</h1>
        <SectionMessage>
          We couldn&apos;t load this submission just now, so there&apos;s nothing to edit yet.
          Try again in a moment.
        </SectionMessage>
      </main>
    );
  }

  const submission = result.data;

  if (!submission.ownedByViewer) {
    redirect(`/submissions/${submission.slug}`);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href={`/submissions/${submission.slug}`}
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
        Back to {submission.name}
      </Link>

      <div className="mb-8 flex items-center gap-4">
        <RepoLogo repositoryFullName={submission.repositoryFullName ?? ""} size={48} />
        <div>
          <h1 className="m-0 text-xl font-medium text-text">Edit {submission.name}</h1>
          <p className="m-0 mt-1 max-w-[60ch] text-[13px] leading-relaxed text-text-muted">
            Change how this appears on the community list. The name, repository and README come
            from GitHub and can&apos;t be edited here.
          </p>
        </div>
      </div>

      <EditSubmissionForm submission={submission} />
    </main>
  );
}
