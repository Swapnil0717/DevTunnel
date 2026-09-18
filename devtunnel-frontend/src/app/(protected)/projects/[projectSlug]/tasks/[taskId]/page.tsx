import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getTaskDetail } from "@/lib/tasks/api";
import { AdminTaskStatusBadge } from "@/components/admin/tasks/admin-task-status-badge";
import { RepoLogo } from "@/components/admin/repo-logo";
import { TechIcon } from "@/components/onboarding/tech-icon";
import { DEVELOPER_ROLE_LABEL, EXPERIENCE_LEVEL_LABEL } from "@/lib/onboarding/types";
import { ChevronLeftIcon, IssueIcon, GitBranchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { MarkdownReadme } from "@/components/ui/markdown-readme";

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
        ? `"${title}" — a DevTunnel task on ${result.data.project.name}: GitHub issue, role, difficulty and tech stack.`
        : "View this DevTunnel task.",
    path: `/projects/${projectSlug}/tasks/${taskId}`,
    noIndex: true,
  });
}

/**
 * `/projects/:projectSlug/tasks/:taskId` — the "View Task" destination
 * `TaskRow` (`components/home/task-row.tsx`) and `TasksTable`
 * (`components/tasks/tasks-table.tsx`) already link to: a contributor
 * clicking a task anywhere in the app lands here, rather than being sent
 * straight to GitHub the way clicking an *issue* is (`/issues` —
 * `IssuesTable`'s row/`externalHref` opens the GitHub issue itself,
 * since a bare GitHub issue has no DevTunnel-side page of its own to
 * show instead).
 *
 * Fetches `GET /projects/:projectSlug/tasks/:taskId`
 * (`lib/tasks/api.ts`) server-side and renders: task title, project,
 * GitHub issue reference, role, difficulty, tech stack, DevTunnel
 * status, and the task's own description (a custom DevTunnel
 * description when curated, falling back to the original GitHub issue
 * body — never rewritten). A task id that doesn't exist, or doesn't
 * belong to `projectSlug`, renders Next's real 404 via `notFound()`
 * rather than a fabricated "empty task" page (Frontend_Development_
 * Rules.txt rule 25); a network failure degrades to one honest
 * `SectionMessage` instead.
 *
 * Read-only, same as the rest of this contributor-facing app: no
 * edit/delete affordance here (that's `/admin/tasks/:id`'s job) — the
 * only action offered is opening the underlying GitHub issue.
 */
export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const { projectSlug, taskId } = await params;
  const result = await getTaskDetail(projectSlug, taskId);

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
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

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
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

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
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

        {task.githubIssue ? (
          <a
            href={task.githubIssue.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-text hover:bg-surface-raised"
          >
            <IssueIcon className="h-3.5 w-3.5 shrink-0" />
            View issue #{task.githubIssue.number}
          </a>
        ) : null}
      </div>

      <section
        aria-labelledby="task-details-heading"
        className="mb-8 rounded-[10px] border border-border bg-surface p-5"
      >
        <h2
          id="task-details-heading"
          className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint"
        >
          Details
        </h2>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-[140px_1fr]">
          <span className="text-text-faint">Role</span>
          <span className="text-text-secondary">
            {task.roles.length
              ? task.roles.map((role) => DEVELOPER_ROLE_LABEL[role]).join(", ")
              : "—"}
          </span>

          <span className="text-text-faint">Difficulty</span>
          <span className="text-text-secondary">
            {task.difficulty ? EXPERIENCE_LEVEL_LABEL[task.difficulty] : "—"}
          </span>

          <span className="text-text-faint">Contributors</span>
          <span className="text-text-secondary">
            {task.activeContributorCount} working · {task.completedContributorCount} completed
          </span>
        </div>
      </section>

      <section
        aria-labelledby="task-techstack-heading"
        className="mb-8 rounded-[10px] border border-border bg-surface p-5"
      >
        <h2
          id="task-techstack-heading"
          className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint"
        >
          Tech stack
        </h2>
        {task.techStack.length === 0 ? (
          <p className="m-0 text-[12px] text-text-faint">No tech stack recorded.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
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
        )}
      </section>

      <section
        aria-labelledby="task-description-heading"
        className="rounded-[10px] border border-border bg-surface p-5"
      >
        <h2
          id="task-description-heading"
          className="m-0 mb-2 text-[11px] uppercase tracking-wide text-text-faint"
        >
          {task.customDescription ? "Description" : "GitHub issue"}
        </h2>
        {task.githubIssue ? (
          <p className="m-0 mb-3 flex items-center gap-2 text-[13px] text-text">
            <span className="font-mono text-text-muted">#{task.githubIssue.number}</span>
            {task.githubIssue.title}
          </p>
        ) : null}
        <div className="max-h-[420px] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-4">
          {task.customDescription ? (
            <MarkdownReadme content={task.customDescription} />
          ) : task.githubIssueBody ? (
            <MarkdownReadme content={task.githubIssueBody} />
          ) : (
            <p className="m-0 text-[12px] text-text-faint">No description provided.</p>
          )}
        </div>
      </section>
    </main>
  );
}
