import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getTaskDetail } from "@/lib/tasks/api";
import { getDevtunnelProjectBySlug } from "@/lib/projects/api";
import { AdminTaskStatusBadge } from "@/components/admin/tasks/admin-task-status-badge";
import { RepoLogo } from "@/components/admin/repo-logo";
import { TechIcon } from "@/components/onboarding/tech-icon";
import { ChevronLeftIcon, GitBranchIcon, IssueIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { ContributeSidebar } from "@/components/contribute/contribute-sidebar";
import { ContributeWorkflowPanel } from "@/components/contribute/contribute-workflow-panel";
import { TaskContributeCliPanel } from "@/components/tasks/task-contribute-cli-panel";
import { TaskProgressTracker } from "@/components/tasks/task-progress-tracker";
import { getTaskClaim } from "@/lib/tasks/progress";
import { buildTaskWorkflowSteps } from "@/lib/contribute/task-workflow";
import { DEVELOPER_ROLE_LABEL, EXPERIENCE_LEVEL_LABEL } from "@/lib/onboarding/types";
import type { ContributeTarget } from "@/lib/contribute/types";
import RouteLoading from "./loading";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";

interface TaskContributePageProps {
  params: Promise<{ projectSlug: string; taskId: string }>;
}

/**
 * Data-driven metadata (rule 48) — names the actual task, and falls back
 * to "this task" rather than `undefined` when the fetch didn't resolve
 * (rule 49). `noindex,follow`: the contribution guide is largely the same generic
 * content for every project or tool (rule 24), so the canonical,
 * indexable page is the project/tool itself; this one stays reachable
 * and crawlable but out of results.
 */
export async function generateMetadata({ params }: TaskContributePageProps): Promise<Metadata> {
  const { projectSlug, taskId } = await params;
  const result = await getTaskDetail(projectSlug, taskId);
  const title = result.status === "ok" ? result.data.title : "this task";

  return buildMetadata({
    title: `Contribute to ${title}`,
    description:
      result.status === "ok"
        ? `How to pick up "${title}" on ${result.data.project.name} — the DevTunnel CLI commands and the manual fork-to-pull-request flow.`
        : "How to contribute to this DevTunnel task.",
    path: `/projects/${projectSlug}/tasks/${taskId}/contribute`,
    noIndex: true,
    followLinks: true,
  });
}

/**
 * `/projects/:projectSlug/tasks/:taskId/contribute` — where the
 * **Contribute to this task** button on the View Task page lands.
 *
 * The task-scoped sibling of `/projects/:projectSlug/contribute`. That
 * page answers "how do I contribute to this *project*?" with a menu of
 * ways to help; this one answers the narrower question a contributor has
 * once they've chosen a task: "what exactly do I run to start *this*?".
 * So it leads with the two concrete routes to a pull request —
 *
 *  1. the DevTunnel CLI, with this task's real id already in
 *     `dev start` / `dev submit` (`TaskContributeCliPanel`), and
 *  2. the manual fork → branch → PR flow, with this task's real issue
 *     number already in the commit message (`buildTaskWorkflowSteps`) —
 *
 * and re-uses the project Contribute page's `ContributeSidebar` (repo
 * files, clone command, tech stack) rather than rebuilding it.
 *
 * Frontend-only, no new endpoint (rule 58). Everything shown is on the
 * two payloads the task page already fetches: the task
 * (`getTaskDetail`) and its project (`getDevtunnelProjectBySlug`). The
 * project fetch is supplementary — it only feeds the sidebar — so if it
 * fails the page still renders the steps, just without the rail.
 *
 * Deliberately doesn't require having joined the project: claiming a
 * task happens server-side inside `dev start` (`POST /tasks/:id/start`),
 * which forks and claims in one step, so there's nothing to gate on and
 * the information is most useful to someone still deciding.
 *
 * Claim-aware (`getTaskClaim`), because the steps mean different things
 * depending on whose task it is — and the task's progress data now says
 * which, so the page no longer has to hedge:
 *
 *  - `done` — nothing left to start; says so and points to other tasks.
 *  - `other` — someone else claimed it, so `dev start` would be
 *    rejected; says so and points to other tasks instead of printing
 *    commands that can only fail.
 *  - `mine` — the steps stay, because `dev start` resumes a task you
 *    already claimed and `dev submit` updates your open PR; the tracker at
 *    the top says where you are.
 *  - `open` — the full steps.
 *  - `unknown` (frontend ahead of backend, no `progress` block) — the
 *    steps stay, with the old "if it's yours…" note, rather than hiding
 *    them on a guess.
 *
 * Same three outcomes every detail route in this app uses: an unknown
 * task (or one that doesn't belong to `projectSlug`) renders Next's real
 * 404 (rule 25), a network failure degrades to one honest
 * `SectionMessage`, and otherwise the page renders.
 */
export default async function TaskContributePage({ params }: TaskContributePageProps) {
  const { projectSlug, taskId } = await params;
  const [result, projectResult] = await Promise.all([
    getTaskDetail(projectSlug, taskId),
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
            href="/tasks"
            className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" />
            Back to Tasks
          </Link>
          <h1 className="m-0 mb-6 text-xl font-medium text-text">Contribute</h1>
          <SectionMessage>This task isn&apos;t available right now — check back soon.</SectionMessage>
        </main>
      </BlueprintReveal>
    );
  }

  const task = result.data;
  const claim = getTaskClaim(task);
  const taskHref = `/projects/${task.project.slug}/tasks/${task.id}`;
  const projectTasksHref = `/projects/${task.project.slug}`;

  const workflowSteps = buildTaskWorkflowSteps({
    repositoryUrl: task.project.repositoryUrl || null,
    repositoryFullName: task.project.repositoryFullName || null,
    issueNumber: task.githubIssue?.number ?? null,
  });

  // Same view model the project Contribute page builds, so the rail can be
  // shared as-is. Only possible when the project fetch succeeded.
  let sidebarTarget: ContributeTarget | null = null;
  if (projectResult.status === "ok") {
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
      detailHref: `/projects/${project.slug}`,
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
          href={taskHref}
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back to task
        </Link>
        <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
          <Link href="/tasks" className="hover:text-accent">
            Tasks
          </Link>
          {" / "}
          <Link href={taskHref} className="hover:text-accent">
            {task.title}
          </Link>
          {" / "}
          <span className="text-text-muted">Contribute</span>
        </nav>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="m-0 mb-1.5 text-xl font-medium text-text">Contribute to this task</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-text-secondary">
              <span className="inline-flex items-center gap-1.5">
                <RepoLogo repositoryFullName={task.project.repositoryFullName} size={14} />
                {task.project.name}
              </span>
              <span aria-hidden="true" className="text-text-faint">
                ·
              </span>
              <a
                href={task.project.repositoryUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1.5 font-mono hover:text-accent"
              >
                <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
                {task.project.repositoryFullName}
              </a>
              <span aria-hidden="true" className="text-text-faint">
                ·
              </span>
              <AdminTaskStatusBadge status={task.status} />
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <Link
              href={taskHref}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
            >
              Task overview
            </Link>
            {task.githubIssue ? (
              <a
                href={task.githubIssue.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
              >
                <IssueIcon className="h-3.5 w-3.5 shrink-0" />
                View issue #{task.githubIssue.number}
              </a>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <TaskProgressTracker task={task} />

            <section
              aria-labelledby="contribute-task-heading"
              className="rounded-[10px] border border-border bg-surface p-5"
            >
              <h2
                id="contribute-task-heading"
                className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint"
              >
                The task
              </h2>
              <p className="m-0 text-[14px] font-medium text-text">{task.title}</p>
              {task.githubIssue ? (
                <p className="m-0 mt-1 text-[12.5px] text-text-secondary">
                  From GitHub issue{" "}
                  <span className="font-mono text-text-muted">#{task.githubIssue.number}</span> —{" "}
                  {task.githubIssue.title}
                </p>
              ) : null}

              <dl className="m-0 mt-4 grid grid-cols-[92px_1fr] gap-x-4 gap-y-2.5 text-[12.5px]">
                <dt className="text-text-faint">Role</dt>
                <dd className="m-0 text-text-secondary">
                  {task.roles.length
                    ? task.roles.map((role) => DEVELOPER_ROLE_LABEL[role]).join(", ")
                    : "—"}
                </dd>
                <dt className="text-text-faint">Difficulty</dt>
                <dd className="m-0 text-text-secondary">
                  {task.difficulty ? EXPERIENCE_LEVEL_LABEL[task.difficulty] : "—"}
                </dd>
              </dl>

              {task.techStack.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {task.techStack.map((value) => (
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
                Read the full brief and the original issue on the{" "}
                <Link href={taskHref} className="text-text-secondary hover:text-accent">
                  task page
                </Link>{" "}
                before you start.
              </p>
            </section>

            {claim === "done" || claim === "other" ? (
              <section className="rounded-[10px] border border-border bg-surface p-5">
                <h2 className="m-0 mb-2 text-[13px] font-medium text-text">
                  {claim === "done"
                    ? "This task is already done"
                    : "Another contributor has already started this task"}
                </h2>
                <p className="m-0 text-[12.5px] leading-relaxed text-text-secondary">
                  {claim === "done"
                    ? "Someone has completed and submitted it, so there's nothing left to start."
                    : "Only one contributor can work on a task at a time, so starting it now would be rejected."}{" "}
                  Pick another task from{" "}
                  <Link href={projectTasksHref} className="text-text hover:text-accent">
                    {task.project.name}
                  </Link>{" "}
                  or browse{" "}
                  <Link href="/tasks" className="text-text hover:text-accent">
                    every open task
                  </Link>
                  .
                </p>
              </section>
            ) : (
              <>
                {claim === "unknown" ? (
                  <SectionMessage>
                    This task is already underway. If it&apos;s yours,{" "}
                    <code className="font-mono">dev start</code> picks up where you left off. If
                    another contributor has claimed it, <code className="font-mono">dev start</code>{" "}
                    will tell you — pick a different task from this project instead.
                  </SectionMessage>
                ) : null}

                <section
                  aria-label="Contribute with the DevTunnel CLI"
                  className="rounded-[10px] border border-border bg-surface p-5"
                >
                  <TaskContributeCliPanel taskId={task.id} />
                </section>

                <section
                  aria-label="Contribute manually with Git"
                  className="rounded-[10px] border border-border bg-surface p-5"
                >
                  {workflowSteps ? (
                    <>
                      <p className="m-0 mb-4 text-[12.5px] leading-relaxed text-text-secondary">
                        Prefer to work without the CLI? The same result by hand — fork, branch, commit
                        and open the pull request yourself
                        {task.githubIssue ? (
                          <>
                            , linking issue{" "}
                            <span className="font-mono text-text-muted">#{task.githubIssue.number}</span>
                          </>
                        ) : null}
                        .
                      </p>
                      <ContributeWorkflowPanel
                        steps={workflowSteps}
                        repositoryUrl={task.project.repositoryUrl || null}
                        contributingGuideUrl={
                          task.project.repositoryUrl
                            ? `${task.project.repositoryUrl}/blob/HEAD/CONTRIBUTING.md`
                            : null
                        }
                      />
                    </>
                  ) : (
                    <SectionMessage>
                      This project has no linked GitHub repository, so there&apos;s no fork-and-pull-request
                      flow to walk through.
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
