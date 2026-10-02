import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getIssueDetail } from "@/lib/issues/detail-api";
import { getDevtunnelProjectBySlug } from "@/lib/projects/api";
import { issueProjectHref } from "@/lib/issues/hrefs";
import { RepoLogo } from "@/components/admin/repo-logo";
import { ChevronLeftIcon, GitBranchIcon, IssueIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { IssueAiExplainCard } from "@/components/issues/issue-ai-explain-card";
import { IssueContributeButton } from "@/components/issues/issue-contribute-button";
import {
  IssueDetailSidebar,
  IssueLabels,
  IssueStateWord,
  IssueTaskNotice,
} from "@/components/issues/issue-detail-sections";
import { TaskIssueSection, TaskProjectSection } from "@/components/tasks/task-detail-sections";
import RouteLoading from "./loading";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";

interface IssueDetailPageProps {
  params: Promise<{ projectSlug: string; issueNumber: string }>;
}

/**
 * Data-driven (rule 48) — names the actual issue, falling back to the
 * generic "Issue" only when the fetch didn't resolve (rule 49).
 * `noindex,follow`, like `/issues` itself: this mirrors third-party GitHub
 * content rather than DevTunnel's own, so indexing it would add thin pages
 * (rule 24) — but it stays crawlable so the project it links to is found.
 */
export async function generateMetadata({ params }: IssueDetailPageProps): Promise<Metadata> {
  const { projectSlug, issueNumber } = await params;
  const result = await getIssueDetail(projectSlug, issueNumber);
  const title = result.status === "ok" ? `#${result.data.number} ${result.data.title}` : "Issue";

  return buildMetadata({
    title,
    description:
      result.status === "ok"
        ? `"${result.data.title}" — an issue on ${result.data.project.name}: project background, the issue as filed, an AI explanation and how to contribute.`
        : "View this issue on DevTunnel.",
    path: `/issues/${projectSlug}/${issueNumber}`,
    noIndex: true,
    followLinks: true,
  });
}

/**
 * `/issues/:projectSlug/:issueNumber` — the "View Issue" destination an
 * issue on `/issues` (`IssuesTable`) or a project's Issues tab opens, rather
 * than sending the contributor straight to GitHub. The issue counterpart of
 * `/projects/:projectSlug/tasks/:taskId`, laid out the same way:
 *
 *  1. **What is this project?**    — `TaskProjectSection` (shared with View Task)
 *  2. **Can AI explain it?**       — `IssueAiExplainCard`: one click, plain-language
 *     explanation, skills, difficulty and first steps. Only requested on that
 *     click, and only shown for an open issue.
 *  3. **What's the issue?**        — `TaskIssueSection` (shared with View Task):
 *     the GitHub issue exactly as filed, never rewritten.
 *
 * …and one obvious next step in the header: **Contribute to this issue**,
 * which leads to `/issues/:projectSlug/:issueNumber/contribute`. If DevTunnel
 * already made a task from the issue, the header button and a notice above
 * the columns point at the task instead — claiming happens there.
 *
 * Two fetches, in parallel: `GET /issues/:projectSlug/:issueNumber` (the
 * issue + task link) and `GET /projects/:projectSlug` (the project's
 * description and "X of Y tasks done" bar) — the same split View Task uses.
 * The project fetch is *supplementary*: if it fails the page still renders
 * the issue and says the description isn't available. Only the issue fetch
 * decides between 404 / error / page.
 *
 * Read-only: no edit affordance — DevTunnel never modifies the original
 * GitHub issue.
 */
export default async function IssueDetailPage({ params }: IssueDetailPageProps) {
  const { projectSlug, issueNumber } = await params;
  const [result, projectResult] = await Promise.all([
    getIssueDetail(projectSlug, issueNumber),
    getDevtunnelProjectBySlug(projectSlug),
  ]);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <BlueprintReveal skeleton={<RouteLoading />}>
        <main className="mx-auto max-w-6xl px-6 py-10">
          <Link
            href="/issues"
            className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
            Back to Issues
          </Link>
          <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
            <Link href="/issues" className="hover:text-accent">
              Issues
            </Link>
            {" / "}
            <span className="text-text-muted">Issue</span>
          </nav>
          <h1 className="m-0 mb-4 text-xl font-medium text-text">Issue</h1>
          <SectionMessage>This issue isn&apos;t available right now — check back soon.</SectionMessage>
        </main>
      </BlueprintReveal>
    );
  }

  const issue = result.data;
  // An issue of a GitHub-catalog repository or a tool has no DevTunnel project behind it.
  const isGithubRepo = issue.source === "github";
  const projectDescription = !isGithubRepo && projectResult.status === "ok" ? projectResult.data.description : null;
  const projectTaskProgress =
    !isGithubRepo && projectResult.status === "ok" ? (projectResult.data.taskProgress ?? null) : null;

  return (
    <BlueprintReveal skeleton={<RouteLoading />}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href="/issues"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back to Issues
        </Link>
        <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
          <Link href="/issues" className="hover:text-accent">
            Issues
          </Link>
          {" / "}
          <span className="text-text-muted">{issue.title}</span>
        </nav>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 mb-1.5 text-xl font-medium text-text">{issue.title}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-text-secondary">
              <span className="font-mono text-text-muted">#{issue.number}</span>
              <span aria-hidden="true" className="text-text-faint">
                ·
              </span>
              <span className="inline-flex items-center gap-1.5">
                <RepoLogo repositoryFullName={issue.project.repositoryFullName} size={14} />
                {issue.project.name}
              </span>
              <span aria-hidden="true" className="text-text-faint">
                ·
              </span>
              <a
                href={issue.project.repositoryUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 font-mono hover:text-accent"
              >
                <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
                {issue.project.repositoryFullName}
              </a>
              <span aria-hidden="true" className="text-text-faint">
                ·
              </span>
              <IssueStateWord state={issue.state} />
            </div>
            <IssueLabels labels={issue.labels} />
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <IssueContributeButton issue={issue} />
            <a
              href={issue.url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
            >
              <IssueIcon className="h-3.5 w-3.5 shrink-0" />
              View issue #{issue.number}
            </a>
          </div>
        </div>

        {issue.task ? (
          <div className="mb-6">
            <IssueTaskNotice task={issue.task} projectSlug={issue.project.slug} />
          </div>
        ) : null}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <TaskProjectSection
              project={issue.project}
              description={projectDescription}
              unavailable={!isGithubRepo && projectResult.status !== "ok"}
              taskProgress={projectTaskProgress}
              projectHref={issueProjectHref(issue.project.slug, issue.source)}
              emptyDescription={
                isGithubRepo ? "This repository is on GitHub and hasn't been onboarded to DevTunnel yet." : undefined
              }
            />
            <IssueAiExplainCard issue={issue} variant="view" />
            <TaskIssueSection issue={issue} body={issue.body} />
          </div>
          <IssueDetailSidebar issue={issue} />
        </div>
      </main>
    </BlueprintReveal>
  );
}
