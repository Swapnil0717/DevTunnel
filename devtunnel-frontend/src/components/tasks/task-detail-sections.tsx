import Link from "next/link";
import { DevtunnelProjectLogo } from "@/components/projects/devtunnel-project-logo";
import { AdminTaskStatusBadge } from "@/components/admin/tasks/admin-task-status-badge";
import { TechIcon } from "@/components/onboarding/tech-icon";
import { StatusDot } from "@/components/ui/status-dot";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import { SectionMessage } from "@/components/home/section-message";
import { ProjectTaskProgress } from "@/components/projects/project-task-progress";
import { GitBranchIcon, IssueIcon } from "@/components/layout/nav-icons";
import { DEVELOPER_ROLE_LABEL, EXPERIENCE_LEVEL_LABEL } from "@/lib/onboarding/types";
import type {
  TaskDetail,
  TaskGithubIssueRef,
  TaskProgressCounts,
  TaskProjectRef,
} from "@/lib/tasks/types";

/**
 * The building blocks of the View Task page
 * (`/projects/:projectSlug/tasks/:taskId`), split out of the route file so
 * the page itself reads as layout — header, main column, rail — and each
 * of the three descriptions a contributor needs is a named, separately
 * readable piece:
 *
 *  1. `TaskProjectSection`     — what the project is (why this work matters)
 *  2. `TaskDescriptionSection` — what DevTunnel is asking for (the curated brief)
 *  3. `TaskIssueSection`       — the original GitHub issue, exactly as filed
 *
 * The task description and the issue description used to be an either/or
 * on this page: a task with a curated description hid the issue body
 * entirely. They're different things — the curated brief is DevTunnel's
 * scoped ask, the issue body is the maintainer-side discussion and
 * context — so both render whenever they exist, each under its own
 * heading. The issue body is still shown exactly as imported, never
 * rewritten ("Do not modify the original GitHub issue",
 * admin_workflow.txt section 10).
 *
 * Server components only — no state, no effects — so the page stays fully
 * server-rendered.
 */

const SECTION_CLASS = "rounded-[10px] border border-border bg-surface p-5";
const HEADING_CLASS = "m-0 text-[11px] uppercase tracking-wide text-text-faint";

/**
 * "About the project". `description` is `null` both when the project has
 * none and when the project fetch failed; `unavailable` tells the two apart
 * so the copy never claims a project has no description just because the
 * request hiccuped (rule 58 — don't present an absence the app can't
 * actually stand behind).
 *
 * `taskProgress` is the project's per-stage task counts (same data as the
 * bar on the project page), shown here as a compact "X of Y tasks done" so
 * someone reading a single task can see how the project around it is
 * doing. Omitted when the project fetch didn't return it.
 */
export function TaskProjectSection({
  project,
  description,
  unavailable,
  taskProgress = null,
}: {
  project: TaskProjectRef;
  description: string | null;
  unavailable: boolean;
  taskProgress?: TaskProgressCounts | null;
}) {
  return (
    <section aria-labelledby="task-project-heading" className={SECTION_CLASS}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="task-project-heading" className={HEADING_CLASS}>
          About the project
        </h2>
        <Link
          href={`/projects/${project.slug}`}
          className="text-[12px] font-medium text-text-muted transition-colors hover:text-accent"
        >
          View project
        </Link>
      </div>

      <div className="flex items-start gap-3">
        <DevtunnelProjectLogo repositoryFullName={project.repositoryFullName} size={40} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[14px] font-medium text-text">{project.name}</p>
          {project.repositoryUrl && project.repositoryFullName ? (
            <a
              href={project.repositoryUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[12px] text-text-secondary hover:text-accent"
            >
              <GitBranchIcon className="h-3.5 w-3.5 shrink-0" />
              {project.repositoryFullName}
            </a>
          ) : null}

          {description ? (
            <p className="m-0 mt-3 whitespace-pre-line text-[13px] leading-relaxed text-text-secondary">
              {description}
            </p>
          ) : (
            <p className="m-0 mt-3 text-[12px] text-text-faint">
              {unavailable
                ? "The project description isn't available right now."
                : "This project has no description yet."}
            </p>
          )}

          {taskProgress ? (
            <div className="mt-4 border-t border-border-subtle pt-3">
              <ProjectTaskProgress counts={taskProgress} compact />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * "Task description" — the DevTunnel-specific brief, when one was
 * written during task onboarding. A task without one isn't broken: it was
 * onboarded straight from its issue, so the issue below *is* the brief,
 * and the empty state says so rather than looking like missing data.
 */
export function TaskDescriptionSection({
  customDescription,
  hasIssue,
}: {
  customDescription: string | null;
  hasIssue: boolean;
}) {
  return (
    <section aria-labelledby="task-description-heading" className={SECTION_CLASS}>
      <h2 id="task-description-heading" className={`${HEADING_CLASS} mb-3`}>
        Task description
      </h2>

      {customDescription ? (
        <div className="max-h-[480px] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-4">
          <MarkdownReadme content={customDescription} />
        </div>
      ) : (
        <SectionMessage>
          {hasIssue
            ? "No separate task description was written — the GitHub issue below is the full brief."
            : "No task description was provided."}
        </SectionMessage>
      )}
    </section>
  );
}

/**
 * "Issue description" — the linked GitHub issue: number, title, whether
 * it's still open on GitHub, who filed it, and the body as imported.
 *
 * The open/closed state is shown in words beside a dot, never as color
 * alone (rule 43), and matters here for the same reason it does on the
 * All Issues table: an issue can be closed on GitHub before a contributor
 * gets to the task.
 */
export function TaskIssueSection({
  issue,
  body,
}: {
  issue: TaskGithubIssueRef | null;
  body: string | null;
}) {
  return (
    <section aria-labelledby="task-issue-heading" className={SECTION_CLASS}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="task-issue-heading" className={HEADING_CLASS}>
          Issue description
        </h2>
        {issue ? (
          <a
            href={issue.url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-text-muted transition-colors hover:text-accent"
          >
            <IssueIcon className="h-3.5 w-3.5 shrink-0" />
            View #{issue.number} on GitHub
          </a>
        ) : null}
      </div>

      {issue ? (
        <>
          <p className="m-0 flex items-start gap-2 text-[13.5px] font-medium text-text">
            <span className="font-mono font-normal text-text-muted">#{issue.number}</span>
            <span className="min-w-0">{issue.title}</span>
          </p>
          <div className="mb-3 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-secondary">
            <span className="inline-flex items-center gap-1.5">
              <StatusDot color={issue.state === "OPEN" ? "#639922" : "#6B6B6B"} />
              {issue.state === "OPEN" ? "Open on GitHub" : "Closed on GitHub"}
            </span>
            <span aria-hidden="true" className="text-text-faint">
              ·
            </span>
            <span>
              Opened by{" "}
              <a
                href={issue.author.profileUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="hover:text-accent"
              >
                {issue.author.username}
              </a>
            </span>
          </div>

          <div className="max-h-[480px] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-4">
            {body ? (
              <MarkdownReadme content={body} />
            ) : (
              <p className="m-0 text-[12px] text-text-faint">
                The issue has no description on GitHub.
              </p>
            )}
          </div>
        </>
      ) : (
        <SectionMessage>This task isn&apos;t linked to a GitHub issue.</SectionMessage>
      )}
    </section>
  );
}

/**
 * The right-hand rail: the task's facts (status, role, difficulty,
 * contributors) and its tech stack. Same rail-of-cards shape
 * `ProjectDetailSidebar` uses on the project page, stacking under the
 * main column on narrow screens.
 *
 * There's deliberately no accent-colored action in the rail — the page's
 * one primary action is the Contribute button in the header, and a second
 * copy of it down here would give the page two primary actions.
 */
export function TaskDetailSidebar({ task }: { task: TaskDetail }) {
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
      <section aria-labelledby="task-details-heading" className={SECTION_CLASS}>
        <h2 id="task-details-heading" className={`${HEADING_CLASS} mb-3`}>
          Details
        </h2>
        <dl className="m-0 grid grid-cols-[92px_1fr] gap-x-4 gap-y-3 text-[12.5px]">
          <dt className="text-text-faint">Status</dt>
          <dd className="m-0">
            <AdminTaskStatusBadge status={task.status} />
          </dd>

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

          <dt className="text-text-faint">Contributors</dt>
          <dd className="m-0 text-text-secondary">
            {task.activeContributorCount} working · {task.completedContributorCount} completed
          </dd>
        </dl>
      </section>

      <section aria-labelledby="task-techstack-heading" className={SECTION_CLASS}>
        <h2 id="task-techstack-heading" className={`${HEADING_CLASS} mb-3`}>
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
    </aside>
  );
}
