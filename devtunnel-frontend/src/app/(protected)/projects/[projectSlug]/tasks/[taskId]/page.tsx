import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getTaskDetail } from "@/lib/tasks/api";
import { getDevtunnelProjectBySlug } from "@/lib/projects/api";
import { RepoLogo } from "@/components/admin/repo-logo";
import { AdminTaskStatusBadge } from "@/components/admin/tasks/admin-task-status-badge";
import { ChevronLeftIcon, IssueIcon, GitBranchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { TaskContributeButton } from "@/components/tasks/task-contribute-button";
import {
  TaskDescriptionSection,
  TaskDetailSidebar,
  TaskIssueSection,
  TaskProjectSection,
} from "@/components/tasks/task-detail-sections";

interface TaskDetailPageProps {
  params: Promise<{ projectSlug: string; taskId: string }>;
}

/**
 * Data-driven per rule 48 — describes the actual task, never a hardcoded
 * string repeated for every id. Falls back to the generic "Task" only
 * when the fetch hasn't resolved to a real title yet, never `undefined`
 * (rule 49). `noIndex: true` — this is a signed-in contributor's view of
 * DevTunnel-internal task data, not public content (rule 18), same
 * posture `/tasks` itself already takes.
 */
export async function generateMetadata({
  params,
}: TaskDetailPageProps): Promise<Metadata> {
  const { projectSlug, taskId } = await params;
  const result = await getTaskDetail(projectSlug, taskId);
  const title = result.status === "ok" ? result.data.title : "Task";

  return buildMetadata({
    title,
    description:
      result.status === "ok"
        ? `"${title}" — a DevTunnel task on ${result.data.project.name}: project background, task brief, GitHub issue and how to contribute.`
        : "View this DevTunnel task.",
    path: `/projects/${projectSlug}/tasks/${taskId}`,
    noIndex: true,
  });
}

/**
 * `/projects/:projectSlug/tasks/:taskId` — the "View Task" destination
 * `TaskRow` (`components/home/task-row.tsx`), `TasksTable`
 * (`components/tasks/tasks-table.tsx`) and the project's Tasks tabs link
 * to: a contributor clicking a task anywhere in the app lands here,
 * rather than being sent straight to GitHub the way clicking a bare
 * *issue* is (`/issues` — `IssuesTable`'s row opens the GitHub issue
 * itself, since a bare GitHub issue has no DevTunnel-side page of its own).
 *
 * The page answers, in reading order, the three questions someone asks
 * before picking a task up:
 *
 *  1. **What is this project?**  — `TaskProjectSection`
 *  2. **What is being asked?**   — `TaskDescriptionSection` (the curated brief)
 *  3. **What's the original issue?** — `TaskIssueSection` (the GitHub issue, as filed)
 *
 * …and then gives them one obvious next step: **Contribute to this task**
 * in the header, which leads to `/projects/:projectSlug/tasks/:taskId/
 * contribute` — the task-scoped Contribute page with the exact
 * `dev start <task-id>` commands and the manual fork-to-PR flow.
 *
 * Two fetches, in parallel: `GET /projects/:projectSlug/tasks/:taskId`
 * for the task (`lib/tasks/api.ts`) and `GET /projects/:projectSlug` for
 * the project's description (`lib/projects/api.ts`). The task payload
 * only carries a trimmed `TaskProjectRef` with no description, and adding
 * one would mean a backend change to say something the project endpoint
 * already says — so this re-uses it, the same way the project Contribute
 * page re-uses the project fetch rather than growing a new endpoint
 * (rule 58). The project fetch is *supplementary*: if it fails, the page
 * still renders the task and the project section says the description
 * isn't available, rather than the whole task disappearing because a
 * secondary request hiccuped. Only the task fetch decides between
 * 404 / error / page.
 *
 * Same three outcomes every detail route in this app uses: a task id that
 * doesn't exist, or doesn't belong to `projectSlug`, renders Next's real
 * 404 via `notFound()` (Frontend_Development_Rules.txt rule 25); a
 * network failure degrades to one honest `SectionMessage`; otherwise the
 * real page renders.
 *
 * Read-only, same as the rest of this contributor-facing app: no
 * edit/delete affordance here (that's `/admin/tasks/:id`'s job).
 */
export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
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
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href="/tasks"
          className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          Back to Tasks
        </Link>
        <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
          <Link href="/tasks" className="hover:text-accent">
            Tasks
          </Link>
          {" / "}
          <span className="text-text-muted">Task</span>
        </nav>
        <h1 className="m-0 mb-4 text-xl font-medium text-text">Task</h1>
        <SectionMessage>This task isn&apos;t available right now — check back soon.</SectionMessage>
      </main>
    );
  }

  const task = result.data;
  const projectDescription = projectResult.status === "ok" ? projectResult.data.description : null;
  const contributeHref = `/projects/${task.project.slug}/tasks/${task.id}/contribute`;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link
        href="/tasks"
        className="mb-4 inline-flex items-center gap-1 text-[12.5px] font-medium text-text-muted transition-colors hover:text-accent"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
        Back to Tasks
      </Link>
      <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
        <Link href="/tasks" className="hover:text-accent">
          Tasks
        </Link>
        {" / "}
        <span className="text-text-muted">{task.title}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="m-0 mb-1.5 text-xl font-medium text-text">{task.title}</h1>
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
          <TaskContributeButton href={contributeHref} status={task.status} />
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
          <TaskProjectSection
            project={task.project}
            description={projectDescription}
            unavailable={projectResult.status !== "ok"}
          />
          <TaskDescriptionSection
            customDescription={task.customDescription}
            hasIssue={task.githubIssue !== null}
          />
          <TaskIssueSection issue={task.githubIssue} body={task.githubIssueBody} />
        </div>
        <TaskDetailSidebar task={task} />
      </div>
    </main>
  );
}
