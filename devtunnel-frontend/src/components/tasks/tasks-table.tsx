import Link from "next/link";
import { AdminTableRow } from "@/components/admin/admin-table-row";
import { AdminTaskStatusBadge } from "@/components/admin/tasks/admin-task-status-badge";
import { RepoLogo } from "@/components/admin/repo-logo";
import { IssueIcon } from "@/components/layout/nav-icons";
import { TechIcon } from "@/components/onboarding/tech-icon";
import { DEVELOPER_ROLE_LABEL, EXPERIENCE_LEVEL_LABEL } from "@/lib/onboarding/types";
import type { Task } from "@/lib/tasks/types";

/**
 * Task's own internal page — same `/projects/:projectSlug/tasks/:taskId`
 * pattern `TaskRow` (`components/home/task-row.tsx`) already links to,
 * reused here rather than invented fresh (rule 51).
 */
function taskHref(task: Task): string {
  return `/projects/${task.project.slug}/tasks/${task.id}`;
}

/** How many tech-stack chips to show inline before collapsing into "+N". */
const MAX_VISIBLE_TECH = 3;

/**
 * Tasks table (`/tasks`) — the contributor-facing counterpart to
 * `AdminTasksTable`: Task, Project, GitHub Issue, Role, Difficulty, Tech
 * Stack, Contributors, Status, Actions. Same columns minus "Submissions"
 * (see `lib/tasks/types.ts`'s doc comment on why) and minus Edit/Delete —
 * those curate DevTunnel's task list, an Admin responsibility; the only
 * action a contributor gets here is opening the task's own page
 * ("View Task"), with the underlying GitHub issue reachable separately
 * from the "GitHub issue" cell.
 *
 * `AdminTableRow`, `RepoLogo`, and `AdminTaskStatusBadge` are reused as-is
 * rather than duplicated: all three are already generic, role-agnostic
 * presentational components (no admin API calls, no admin-only state, no
 * auth check — `AdminTaskStatusBadge` only takes the shared `TaskStatus`
 * value), so copying them here would just be the same code twice
 * (Frontend_Development_Rules.txt rule 51). Same for `TechIcon` /
 * `DEVELOPER_ROLE_LABEL` / `EXPERIENCE_LEVEL_LABEL`, which already back
 * the onboarding form these tasks are filtered against.
 *
 * Every row opens the task's own DevTunnel page — same
 * `/projects/:projectSlug/tasks/:taskId` destination as the "View Task"
 * action (`AdminTableRow`'s internal `href`, real client-side navigation
 * rather than a new tab, per rule 10) — on click anywhere in the row.
 * The underlying GitHub issue is still one click away from the
 * "GitHub issue" cell's own link; it just isn't what the row itself
 * opens, since the row's job is to show what *this task* is, not the
 * raw issue. Important facts (role, difficulty, status) are always
 * shown as text next to any icon, never color/icon alone (rule 43).
 *
 * Two renderings of the same `tasks` list, swapped by breakpoint rather
 * than one squeezed to fit both: below `md` a 9-column table forced the
 * whole page into a sideways-scrolling strip that only ever showed a
 * couple of columns at once, so `<768px` gets `TaskCardList` — one full-
 * width card per task, everything readable without horizontal scroll —
 * and `md` and up keeps the table, still `overflow-x-auto` for anyone on
 * a narrower laptop window. Same data, same fields, same "whole row/card
 * opens the task" behavior either way — nothing is dropped on mobile.
 */
export function TasksTable({ tasks }: { tasks: Task[] }) {
  return (
    <>
      <TaskCardList tasks={tasks} className="md:hidden" />

      <div className="hidden overflow-x-auto rounded-[10px] border border-border md:block">
        <table className="w-full min-w-[1080px] border-collapse text-left text-[12.5px]">
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
              const hiddenTechCount = task.techStack.length - visibleTech.length;

              return (
                <AdminTableRow
                  key={task.id}
                  href={taskHref(task)}
                  className="border-b border-border-subtle last:border-b-0 hover:bg-surface/60"
                >
                  {/* Task */}
                  <th scope="row" className="px-4 py-3 align-top font-medium text-text">
                    <Link href={taskHref(task)} className="hover:text-accent">
                      {task.title}
                    </Link>
                  </th>

                  {/* Project (+ repository) */}
                  <td className="px-4 py-3 align-top">
                    <p className="m-0 text-text-secondary">{task.project.name}</p>
                    <p className="m-0 mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-text-faint">
                      <RepoLogo repositoryFullName={task.project.repositoryFullName} size={14} />
                      {task.project.repositoryFullName}
                    </p>
                  </td>

                  {/* GitHub issue */}
                  <td className="px-4 py-3 align-top">
                    {task.githubIssue ? (
                      <a
                        href={task.githubIssue.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-text-secondary hover:text-accent"
                      >
                        <IssueIcon className="h-3.5 w-3.5 shrink-0" />#{task.githubIssue.number}
                      </a>
                    ) : (
                      <span className="text-text-faint">—</span>
                    )}
                  </td>

                  {/* Role */}
                  <td className="px-4 py-3 align-top text-text-secondary">
                    {task.roles.length
                      ? task.roles.map((role) => DEVELOPER_ROLE_LABEL[role]).join(", ")
                      : "—"}
                  </td>

                  {/* Difficulty */}
                  <td className="px-4 py-3 align-top text-text-secondary">
                    {task.difficulty ? EXPERIENCE_LEVEL_LABEL[task.difficulty] : "—"}
                  </td>

                  {/* Tech stack */}
                  <td className="px-4 py-3 align-top">
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
                          <span className="text-[11px] text-text-faint">+{hiddenTechCount}</span>
                        ) : null}
                      </div>
                    )}
                  </td>

                  {/* Contributors */}
                  <td className="whitespace-nowrap px-4 py-3 align-top text-text-secondary">
                    {task.activeContributorCount} working · {task.completedContributorCount} completed
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3 align-top">
                    <AdminTaskStatusBadge status={task.status} />
                  </td>

                  {/* Actions — View only; editing/deleting a task is an Admin action */}
                  <td className="whitespace-nowrap px-4 py-3 align-top">
                    <Link
                      href={taskHref(task)}
                      className="inline-block rounded-md px-2 py-1 text-[11.5px] font-medium text-text-secondary hover:text-accent"
                    >
                      View Task
                    </Link>
                  </td>
                </AdminTableRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Mobile counterpart to the table above (`<768px`, `md:hidden`) — the
 * same nine facts per task, laid out as a stack of full-width cards
 * instead of table columns, so nothing needs a sideways scroll to read
 * on a phone. Every card is one `Link` to the task page, same as a table
 * row; the GitHub issue keeps its own separate link within the card, same
 * split the table draws between the row's own destination and the
 * "GitHub issue" cell's link.
 */
function TaskCardList({ tasks, className = "" }: { tasks: Task[]; className?: string }) {
  return (
    <ul className={`m-0 flex list-none flex-col gap-3 p-0 ${className}`}>
      {tasks.map((task) => {
        const visibleTech = task.techStack.slice(0, MAX_VISIBLE_TECH);
        const hiddenTechCount = task.techStack.length - visibleTech.length;

        return (
          <li
            key={task.id}
            className="rounded-[10px] border border-border bg-surface p-4"
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <Link
                href={taskHref(task)}
                className="text-[13.5px] font-medium text-text hover:text-accent"
              >
                {task.title}
              </Link>
              <AdminTaskStatusBadge status={task.status} />
            </div>

            <p className="m-0 mb-3 flex items-center gap-1.5 font-mono text-[11px] text-text-faint">
              <RepoLogo repositoryFullName={task.project.repositoryFullName} size={14} />
              <span className="truncate">
                {task.project.name} · {task.project.repositoryFullName}
              </span>
            </p>

            <dl className="m-0 mb-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12px]">
              <div>
                <dt className="text-text-faint">Role</dt>
                <dd className="m-0 mt-0.5 text-text-secondary">
                  {task.roles.length
                    ? task.roles.map((role) => DEVELOPER_ROLE_LABEL[role]).join(", ")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-text-faint">Difficulty</dt>
                <dd className="m-0 mt-0.5 text-text-secondary">
                  {task.difficulty ? EXPERIENCE_LEVEL_LABEL[task.difficulty] : "—"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-text-faint">Contributors</dt>
                <dd className="m-0 mt-0.5 text-text-secondary">
                  {task.activeContributorCount} working · {task.completedContributorCount} completed
                </dd>
              </div>
            </dl>

            {task.techStack.length > 0 ? (
              <div className="mb-3 flex flex-wrap items-center gap-1">
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
                  <span className="text-[11px] text-text-faint">+{hiddenTechCount}</span>
                ) : null}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3">
              {task.githubIssue ? (
                <a
                  href={task.githubIssue.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-text-secondary hover:text-accent"
                >
                  <IssueIcon className="h-3.5 w-3.5 shrink-0" />#{task.githubIssue.number}
                </a>
              ) : (
                <span className="text-[11.5px] text-text-faint">No linked issue</span>
              )}

              <Link
                href={taskHref(task)}
                className="inline-flex items-center rounded-md px-2 py-1 text-[12px] font-medium text-accent hover:underline"
              >
                View Task →
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
