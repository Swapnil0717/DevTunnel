import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildMetadata } from "@/lib/seo";
import { getAdminTaskDetail } from "@/lib/admin/tasks/api";
import { AdminTaskStatusBadge } from "@/components/admin/tasks/admin-task-status-badge";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { DeleteTaskButton } from "@/components/admin/tasks/delete-task-button";
import { EditTaskDetailsPanel } from "@/components/admin/tasks/edit-task-details-panel";
import { TechIcon } from "@/components/onboarding/tech-icon";
import { IssueIcon, GitBranchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { MarkdownReadme } from "@/components/ui/markdown-readme";

interface TaskDetailPageProps {
  params: { id: string };
  /**
   * `?edit=1` opens the Curation panel straight into edit mode — same
   * convention as the Project Detail page's `?edit=1` (there is no
   * separate `/admin/tasks/:id/edit` route in the spec; section 22 only
   * lists a flat `PATCH /admin/tasks/:id`).
   */
  searchParams?: { edit?: string };
}

/**
 * Data-driven per rule 48 — describes the actual task, never a hardcoded
 * string repeated for every id. Falls back to the generic "Task" only
 * when the fetch hasn't resolved to a real title yet, never `undefined`
 * (rule 49). `noIndex: true` throughout — private Admin Portal UI, not
 * public content (rule 18).
 */
export async function generateMetadata({
  params,
}: TaskDetailPageProps): Promise<Metadata> {
  const result = await getAdminTaskDetail(params.id);
  const title = result.status === "ok" ? result.data.title : "Task";

  return buildMetadata({
    title,
    description: `Manage the "${title}" DevTunnel task — GitHub issue, curation, contributors and submissions.`,
    path: `/admin/tasks/${params.id}`,
    noIndex: true,
  });
}

/**
 * `/admin/tasks/:id` — Admin Portal Master Coding Specification, section
 * 13 ("Task Page")'s detail sibling / A14 in the final page list
 * (section 29): "Task + contributor/submission data".
 *
 * Fetches `GET /admin/tasks/:id` (section 22 — Admin Backend API Map)
 * server-side and renders: task title, project, GitHub issue (with its
 * original description, never rewritten — section 10), role, difficulty,
 * tech stack, DevTunnel status, and the section 14 contributor/submission
 * breakdown (Working / Completed / Submitted). That endpoint isn't built
 * on the backend yet (see `lib/admin/tasks/api.ts`), so — same convention
 * as the Project Detail page — a failed fetch degrades to one honest
 * `SectionMessage`, and an unknown id renders Next's real 404 via
 * `notFound()` rather than a fabricated "empty task" page
 * (Frontend_Development_Rules.txt rule 25).
 *
 * Curation (role, difficulty, status, custom description) is editable
 * inline — see `EditTaskDetailsPanel` — rather than a separate `/edit`
 * route, same reasoning `EditProjectDetailsPanel` documents. "Delete
 * task" replaces the row's destructive action here too, and is explicit
 * in its confirmation copy that GitHub is unaffected (section 15).
 */
export default async function AdminTaskDetailPage({
  params,
  searchParams,
}: TaskDetailPageProps) {
  const result = await getAdminTaskDetail(params.id);
  const startInEditMode = searchParams?.edit === "1";

  if (result.status === "not-found") {
    notFound();
  }

  if (result.status === "error") {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
          <Link href="/admin/tasks" className="hover:text-accent">
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
      <nav aria-label="Breadcrumb" className="mb-6 text-[12.5px] text-text-faint">
        <Link href="/admin/tasks" className="hover:text-accent">
          Tasks
        </Link>
        {" / "}
        <span className="text-text-muted">{task.title}</span>
      </nav>

      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1.5 text-xl font-medium text-text">{task.title}</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-text-secondary">
            <Link
              href={`/admin/projects/${task.project.id}`}
              className="inline-flex items-center gap-1.5 hover:text-accent"
            >
              {task.project.name}
            </Link>
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

        <div className="flex flex-wrap items-center gap-2">
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
          <DeleteTaskButton
            taskId={task.id}
            taskTitle={task.title}
            variant="button"
            redirectTo="/admin/tasks"
          />
        </div>
      </div>

      <section aria-labelledby="task-stats-heading" className="mb-8">
        <h2 id="task-stats-heading" className="mb-2.5 text-[12.5px] font-normal text-text-muted">
          Contributors &amp; submissions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <AdminStatCard label="Working" value={task.activeContributorCount} />
          <AdminStatCard label="Completed" value={task.completedContributorCount} />
          <AdminStatCard label="Submitted" value={task.submissionCount} />
        </div>
      </section>

      <EditTaskDetailsPanel task={task} startInEditMode={startInEditMode} />

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
        aria-labelledby="task-issue-heading"
        className="rounded-[10px] border border-border bg-surface p-5"
      >
        <h2
          id="task-issue-heading"
          className="m-0 mb-2 text-[11px] uppercase tracking-wide text-text-faint"
        >
          GitHub issue
        </h2>
        {task.githubIssue ? (
          <p className="m-0 mb-3 flex items-center gap-2 text-[13px] text-text">
            <span className="font-mono text-text-muted">#{task.githubIssue.number}</span>
            {task.githubIssue.title}
          </p>
        ) : null}
        <div className="max-h-[420px] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-4">
          {task.githubIssueBody ? (
            <MarkdownReadme content={task.githubIssueBody} />
          ) : (
            <p className="m-0 text-[12px] text-text-faint">No description provided.</p>
          )}
        </div>
      </section>
    </main>
  );
}