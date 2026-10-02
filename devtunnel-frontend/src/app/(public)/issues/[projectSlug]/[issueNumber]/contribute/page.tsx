import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getIssueDetail } from "@/lib/issues/detail-api";
import { getDevtunnelProjectBySlug } from "@/lib/projects/api";
import { issueHref, issueProjectHref } from "@/lib/issues/hrefs";
import { RepoLogo } from "@/components/admin/repo-logo";
import { TechIcon } from "@/components/onboarding/tech-icon";
import { ChevronLeftIcon, GitBranchIcon, IssueIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { ContributeSidebar } from "@/components/contribute/contribute-sidebar";
import { ContributeWorkflowPanel } from "@/components/contribute/contribute-workflow-panel";
import { IssueAiExplainCard } from "@/components/issues/issue-ai-explain-card";
import { IssueContributeCliPanel } from "@/components/issues/issue-contribute-cli-panel";
import { IssueLabels, IssueStateWord } from "@/components/issues/issue-detail-sections";
import { buildTaskWorkflowSteps } from "@/lib/contribute/task-workflow";
import type { ContributeTarget } from "@/lib/contribute/types";
import RouteLoading from "./loading";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";

interface IssueContributePageProps {
  params: Promise<{ projectSlug: string; issueNumber: string }>;
}

/**
 * Data-driven (rule 48), falling back to "this issue" rather than
 * `undefined` (rule 49). `noindex,follow`: like the task Contribute page, the
 * steps are largely the same generic content for every issue (rule 24).
 */
export async function generateMetadata({ params }: IssueContributePageProps): Promise<Metadata> {
  const { projectSlug, issueNumber } = await params;
  const result = await getIssueDetail(projectSlug, issueNumber);
  const title = result.status === "ok" ? result.data.title : "this issue";

  return buildMetadata({
    title: `Contribute to ${title}`,
    description:
      result.status === "ok"
        ? `How to pick up "${title}" on ${result.data.project.name} — the fork-to-pull-request flow, with the issue number already filled in.`
        : "How to contribute to this issue on DevTunnel.",
    path: `/issues/${projectSlug}/${issueNumber}/contribute`,
    noIndex: true,
    followLinks: true,
  });
}

/**
 * `/issues/:projectSlug/:issueNumber/contribute` — where the **Contribute to
 * this issue** button on the View Issue page lands. The issue counterpart of
 * `/projects/:projectSlug/tasks/:taskId/contribute`, and built the same way:
 * a summary of the thing, an AI card, the steps, and the shared
 * `ContributeSidebar` (repo files, clone command, tech stack) beside them.
 *
 * What differs from a task is the honest part. A *task* is something
 * DevTunnel curated and tracks: `dev start <task-id>` claims it and
 * `dev submit` opens the pull request. A bare *issue* is none of that — the
 * CLI takes a task id or a project id, never an issue, and its `--project`
 * mode claims the whole project for one contributor at a time, so pointing
 * every issue-picker at it would have them blocking each other. So this page
 * says plainly that the issue isn't a DevTunnel task and gives the one route
 * that does fit: the manual fork → branch → pull-request flow
 * (`buildTaskWorkflowSteps`, which fills this issue's number into the commit
 * step), plus the habit that actually prevents duplicate work on GitHub —
 * comment on the issue before you start.
 *
 * Frontend-only apart from the issue fetch (rule 58): everything shown is on
 * the two payloads the View Issue page already uses — the issue
 * (`getIssueDetail`) and its project (`getDevtunnelProjectBySlug`). The
 * project fetch is supplementary — it only feeds the sidebar — so if it
 * fails the page still renders the steps, just without the rail.
 *
 * Doesn't require sign-in or having joined the project: the information is
 * most useful to someone still deciding. Branches by what's actually true:
 *
 *  - closed — nothing left to start; says so and points to other issues.
 *  - a DevTunnel task exists — claiming happens on the task, so the page
 *    sends the visitor to its Contribute page instead of printing steps that
 *    would bypass it.
 *  - otherwise (a DevTunnel project's issue or a GitHub-catalog / tool repository's) — the AI card, the
 *    `dev` CLI commands with this issue's `owner/repo#number` filled in, a "no task to claim" note and the manual
 *    steps.
 *
 * Same three outcomes every detail route in this app uses: an unknown issue
 * renders Next's real 404 (rule 25), a network failure degrades to one honest
 * `SectionMessage`, and otherwise the page renders.
 */
export default async function IssueContributePage({ params }: IssueContributePageProps) {
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
          <h1 className="m-0 mb-6 text-xl font-medium text-text">Contribute</h1>
          <SectionMessage>This issue isn&apos;t available right now — check back soon.</SectionMessage>
        </main>
      </BlueprintReveal>
    );
  }

  const issue = result.data;
  const isOpen = issue.state === "OPEN";
  const issuePageHref = issueHref(issue.project.slug, issue.number);
  const isGithubRepo = issue.source === "github";
  const projectHref = issueProjectHref(issue.project.slug, issue.source);

  const workflowSteps = buildTaskWorkflowSteps({
    repositoryUrl: issue.project.repositoryUrl || null,
    repositoryFullName: issue.project.repositoryFullName || null,
    issueNumber: issue.number,
  });

  // Same view model the project and task Contribute pages build, so the rail
  // can be shared as-is. Only possible when the project fetch succeeded.
  let sidebarTarget: ContributeTarget | null = null;
  if (isGithubRepo) {
    // No DevTunnel project behind this issue, so the rail is built from the issue's own repository facts —
    // no extra request, nothing invented (description / license / issue count are simply left out).
    sidebarTarget = {
      kind: "github-repo",
      slug: issue.project.slug,
      projectId: null,
      name: issue.project.name,
      description: null,
      repositoryUrl: issue.project.repositoryUrl || null,
      repositoryFullName: issue.project.repositoryFullName || null,
      cloneUrl: issue.project.repositoryUrl ? `${issue.project.repositoryUrl}.git` : null,
      techStack: issue.project.techStack,
      license: null,
      openIssuesCount: null,
      detailHref: projectHref,
      listHref: "/github-projects",
      listLabel: "GitHub Projects",
      viewerIsContributing: false,
      tasks: [],
    };
  } else if (projectResult.status === "ok") {
    const project = projectResult.data;
    sidebarTarget = {
      kind: "project",
      slug: project.slug,
      projectId: project.id,
      name: project.name,
      description: project.description,
      repositoryUrl: project.repositoryUrl,
      repositoryFullName: project.repositoryFullName,
      cloneUrl: `${project.repositoryUrl}.git`,
      techStack: project.techStack,
      license: project.license,
      openIssuesCount: project.openIssuesCount,
      detailHref: projectHref,
      listHref: "/projects",
      listLabel: "Projects",
      viewerIsContributing: project.viewerIsContributing,
      tasks: project.tasks,
    };
  }

  return (
    <BlueprintReveal skeleton={<RouteLoading />}>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href={issuePageHref}
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back to issue
        </Link>
        <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
          <Link href="/issues" className="hover:text-accent">
            Issues
          </Link>
          {" / "}
          <Link href={issuePageHref} className="hover:text-accent">
            {issue.title}
          </Link>
          {" / "}
          <span className="text-text-muted">Contribute</span>
        </nav>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 mb-1.5 text-xl font-medium text-text">Contribute to this issue</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-text-secondary">
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
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <Link
              href={issuePageHref}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
            >
              Issue overview
            </Link>
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

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <section
              aria-labelledby="contribute-issue-heading"
              className="rounded-[10px] border border-border bg-surface p-5"
            >
              <h2
                id="contribute-issue-heading"
                className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint"
              >
                The issue
              </h2>
              <p className="m-0 text-[14px] font-medium text-text">{issue.title}</p>
              <p className="m-0 mt-1 text-[12.5px] text-text-secondary">
                <span className="font-mono text-text-muted">#{issue.number}</span> on {issue.project.name} — opened by{" "}
                <a
                  href={issue.author.profileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="hover:text-accent"
                >
                  @{issue.author.username}
                </a>
              </p>

              <IssueLabels labels={issue.labels} />

              {issue.project.techStack.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {issue.project.techStack.map((value) => (
                    <span
                      key={value}
                      className="inline-flex items-center gap-1.5 rounded-md border border-tag-tech-border bg-tag-tech-bg px-2 py-0.5 text-[11.5px] text-tag-tech-text"
                    >
                      <TechIcon name={value} />
                      {value}
                    </span>
                  ))}
                </div>
              ) : null}

              <p className="m-0 mt-4 border-t border-border-subtle pt-3 text-[12px] text-text-faint">
                Read the full issue and the project background on the{" "}
                <Link href={issuePageHref} className="text-text-secondary hover:text-accent">
                  issue page
                </Link>{" "}
                before you start.
              </p>
            </section>

            {!isOpen ? (
              <section className="rounded-[10px] border border-border bg-surface p-5">
                <h2 className="m-0 mb-2 text-[13px] font-medium text-text">This issue is closed</h2>
                <p className="m-0 text-[12.5px] leading-relaxed text-text-secondary">
                  It was closed on GitHub, so there&apos;s nothing left to start. Pick another issue from{" "}
                  <Link href={projectHref} className="text-text hover:text-accent">
                    {issue.project.name}
                  </Link>{" "}
                  or browse{" "}
                  <Link href="/issues" className="text-text hover:text-accent">
                    every open issue
                  </Link>
                  .
                </p>
              </section>
            ) : issue.task ? (
              <section className="rounded-[10px] border border-border bg-surface p-5">
                <h2 className="m-0 mb-2 text-[13px] font-medium text-text">DevTunnel has a task for this issue</h2>
                <p className="m-0 text-[12.5px] leading-relaxed text-text-secondary">
                  Claiming the work and opening your pull request happen on the task, with the exact{" "}
                  <code className="font-mono">dev</code> commands filled in — so use its page rather than the generic
                  steps.{" "}
                  <Link
                    href={`/projects/${issue.project.slug}/tasks/${issue.task.id}/contribute`}
                    className="text-text hover:text-accent"
                  >
                    Contribute to the task
                  </Link>
                  .
                </p>
              </section>
            ) : (
              <>
                <IssueAiExplainCard issue={issue} variant="contribute" />

                <section
                  aria-label="Contribute with the DevTunnel CLI"
                  className="rounded-[10px] border border-border bg-surface p-5"
                >
                  {issue.project.repositoryFullName ? (
                    <IssueContributeCliPanel
                      repositoryFullName={issue.project.repositoryFullName}
                      issueNumber={issue.number}
                    />
                  ) : (
                    <SectionMessage>
                      This project has no linked GitHub repository, so there&apos;s nothing for the CLI to fork.
                    </SectionMessage>
                  )}
                </section>

                <section
                  aria-labelledby="contribute-not-task-heading"
                  className="rounded-[10px] border border-border bg-surface p-5"
                >
                  <h2 id="contribute-not-task-heading" className="m-0 mb-2 text-[13px] font-medium text-text">
                    {isGithubRepo ? "This is a GitHub issue, not a DevTunnel task" : "No DevTunnel task for this issue yet"}
                  </h2>
                  <p className="m-0 text-[12.5px] leading-relaxed text-text-secondary">
                    There&apos;s no DevTunnel task to claim, so nothing here marks the issue as taken. The CLI above
                    works on any public GitHub issue, and your pull request still counts as a DevTunnel contribution.
                  </p>
                  <p className="m-0 mt-2 text-[12.5px] leading-relaxed text-text-secondary">
                    Before you start, check nobody already has it and{" "}
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-text hover:text-accent"
                    >
                      leave a comment on GitHub
                    </a>{" "}
                    saying you&apos;d like to take it. The CLI links{" "}
                    <span className="font-mono text-text-muted">#{issue.number}</span> in your pull request so GitHub
                    connects the two.
                  </p>
                </section>

                <section
                  aria-label="Contribute manually with Git"
                  className="rounded-[10px] border border-border bg-surface p-5"
                >
                  {workflowSteps ? (
                    <>
                      <p className="m-0 mb-4 text-[12.5px] leading-relaxed text-text-secondary">
                        Prefer plain Git? Fork, branch, commit and open the pull request yourself, linking issue{" "}
                        <span className="font-mono text-text-muted">#{issue.number}</span>.
                      </p>
                      <ContributeWorkflowPanel
                        steps={workflowSteps}
                        repositoryUrl={issue.project.repositoryUrl || null}
                        contributingGuideUrl={
                          issue.project.repositoryUrl ? `${issue.project.repositoryUrl}/blob/HEAD/CONTRIBUTING.md` : null
                        }
                      />
                    </>
                  ) : (
                    <SectionMessage>
                      This project has no linked GitHub repository, so there&apos;s no fork-and-pull-request flow to
                      walk through.
                    </SectionMessage>
                  )}
                </section>
              </>
            )}
          </div>

          {sidebarTarget ? <ContributeSidebar target={sidebarTarget} /> : null}
        </div>
      </main>
    </BlueprintReveal>
  );
}
