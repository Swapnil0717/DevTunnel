import Link from "next/link";
import { IssueIcon } from "@/components/layout/nav-icons";
import { TechIcon } from "@/components/onboarding/tech-icon";
import {
  DEVELOPER_ROLE_LABEL,
  EXPERIENCE_LEVEL_LABEL,
} from "@/lib/onboarding/types";
import { AdminTaskStatusBadge } from "./admin-task-status-badge";
import { DeleteTaskButton } from "./delete-task-button";
import type { AdminTaskSummary } from "@/lib/admin/tasks/types";

/** How many tech-stack chips to show inline before collapsing into "+N". */
const MAX_VISIBLE_TECH = 3;

/**
 * Tasks table — admin_workflow.txt section 13 ("Task Page ▸ Frontend")
 * plus section 14 ("People Doing Tasks"):
 *
 * Task, Project, GitHub Issue, Role, Difficulty, Tech Stack,
 * Contributors (Working / Completed), Submissions, Status, Actions.
 *
 * Role and Tech Stack aren't in section 13's column list verbatim, but
 * both are real curated fields (`devtunnel.tasks.role`, the project's own
 * validated tech stack) surfaced here so the filter bar
 * (`AdminTasksExplorer`) has visible columns to filter by — never a
 * fabricated field (Frontend_Development_Rules.txt rule 58).
 *
 * Actions:
 * - View: Task Detail page
 * - Edit: Task Detail page with ?edit=1 (same convention as
 *   `AdminProjectsTable`'s Edit action)
 * - Delete: Removes the DevTunnel task (GitHub issue is unaffected)
 */
export function AdminTasksTable({ tasks }: { tasks: AdminTaskSummary[] }) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-border">
      <table className="w-full min-w-[1180px] border-collapse text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-border bg-surface">
            {[
              "Task",
              "Project",
              "GitHub issue",
              "Role",
              "Difficulty",
              "Tech stack",
              "Contributors",
              "Submissions",
              "Status",
              "Actions",
            ].map((heading) => (
              <th
                key={heading}
                scope="col"
                className="px-4 py-3 text-[11px] font-normal uppercase tracking-wide text-text-faint"
              >
                {heading}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {tasks.map((task) => {
            const visibleTech = task.techStack.slice(0, MAX_VISIBLE_TECH);
            const hiddenTechCount =
              task.techStack.length - visibleTech.length;

            return (
              <tr
                key={task.id}
                className="border-b border-border-subtle last:border-b-0 hover:bg-surface/60"
              >
                {/* Task */}
                <th scope="row" className="px-4 py-3 font-medium text-text">
                  {task.title}
                </th>

                {/* Project (+ repository, so "GitHub repo" is visible without a separate column) */}
                <td className="px-4 py-3">
                  <p className="m-0 text-text-secondary">
                    {task.project.name}
                  </p>

                  <p className="m-0 mt-0.5 font-mono text-[11px] text-text-faint">
                    {task.project.repositoryFullName}
                  </p>
                </td>

                {/* GitHub Issue */}
                <td className="px-4 py-3">
                  {task.githubIssue ? (
                    <a
                      href={task.githubIssue.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-text-secondary hover:text-accent"
                    >
                      <IssueIcon className="h-3.5 w-3.5 shrink-0" />
                      #{task.githubIssue.number}
                    </a>
                  ) : (
                    <span className="text-text-faint">—</span>
                  )}
                </td>

                {/* Role */}
                <td className="px-4 py-3 text-text-secondary">
                  {task.roles.length
                    ? task.roles.map((role) => DEVELOPER_ROLE_LABEL[role]).join(", ")
                    : "—"}
                </td>

                {/* Difficulty */}
                <td className="px-4 py-3 text-text-secondary">
                  {task.difficulty
                    ? EXPERIENCE_LEVEL_LABEL[task.difficulty]
                    : "—"}
                </td>

                {/* Tech stack */}
                <td className="px-4 py-3">
                  {task.techStack.length === 0 ? (
                    <span className="text-text-faint">—</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-1">
                      {visibleTech.map((value) => (
                        <span
                          key={value}
                          className="inline-flex items-center gap-1 rounded-md border border-tag-tech-border bg-tag-tech-bg px-1.5 py-0.5 text-[11px] text-tag-tech-text"
                        >
                          <TechIcon name={value} />
                          {value}
                        </span>
                      ))}

                      {hiddenTechCount > 0 ? (
                        <span className="text-[11px] text-text-faint">
                          +{hiddenTechCount}
                        </span>
                      ) : null}
                    </div>
                  )}
                </td>

                {/* Contributors — section 14: Working / Completed */}
                <td className="whitespace-nowrap px-4 py-3 text-text-secondary">
                  {task.activeContributorCount} working ·{" "}
                  {task.completedContributorCount} completed
                </td>

                {/* Submissions — section 14: Submitted */}
                <td className="px-4 py-3 text-text-secondary">
                  {task.submissionCount}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <AdminTaskStatusBadge status={task.status} />
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1">
                    {/* View */}
                    <Link
                      href={`/admin/tasks/${task.id}`}
                      className="rounded-md px-2 py-1 text-[11.5px] font-medium text-text-secondary hover:text-accent"
                    >
                      View
                    </Link>

                    {/* Edit */}
                    <Link
                      href={`/admin/tasks/${task.id}?edit=1`}
                      className="rounded-md px-2 py-1 font-mono text-[11.5px] font-medium text-text-secondary hover:text-accent"
                    >
                      Edit
                    </Link>

                    {/* Delete */}
                    <DeleteTaskButton
                      taskId={task.id}
                      taskTitle={task.title}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}