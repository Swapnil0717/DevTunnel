"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AdminTaskStatusBadge } from "@/components/admin/tasks/admin-task-status-badge";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { IssueIcon, ChevronRightIcon } from "@/components/layout/nav-icons";
import { getTechTagClasses } from "@/lib/home/tag-style";
import { DEVELOPER_ROLE_LABEL, EXPERIENCE_LEVEL_LABEL } from "@/lib/onboarding/types";
import type { Task, TaskStatus } from "@/lib/tasks/types";

type StatusFilter = "ALL" | TaskStatus;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];

/** How many tech-stack chips to show inline on a row before collapsing into "+N". */
const MAX_VISIBLE_TECH = 3;

/**
 * "Tasks" tab of the View Project page — the DevTunnel tasks curated on
 * this one project.
 *
 * `TasksTable` (`components/tasks/tasks-table.tsx`) is deliberately *not*
 * reused here. That table is built for `/tasks`, where rows come from
 * every project at once, so it carries a Project column, a repository
 * cell, and a 1080px minimum width to fit them — all of which is dead
 * weight (and a horizontal scrollbar) inside a project's own page, where
 * every row belongs to the project named in the header. This is the same
 * list of facts in a card-row layout that fits the tab's column and
 * stays readable on a phone, which is where the sidebar drops below the
 * body anyway.
 *
 * The status filter is client-side over the tasks already in the page's
 * payload — no second fetch, same "one fetch, browser-side narrowing"
 * shape `DevtunnelProjectsExplorer` and `IssuesExplorer` use. Counts on
 * the filter chips come from the real list, never a separate number that
 * could disagree with what's shown (rule 38).
 *
 * Every row opens the task's own page
 * (`/projects/:projectSlug/tasks/:taskId`) — the destination `TaskRow`
 * and `TasksTable` already link to — with the underlying GitHub issue
 * reachable separately from its own link, since the row's job is to show
 * what *this task* is, not the raw issue. Role, difficulty and status are
 * always words, never color or an icon alone (rule 43).
 */
export function ProjectTasksPanel({
  projectSlug,
  tasks,
  repositoryUrl,
}: {
  projectSlug: string;
  tasks: Task[];
  repositoryUrl: string;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { ALL: tasks.length };
    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    }
    return byStatus;
  }, [tasks]);

  const visibleTasks = useMemo(
    () =>
      statusFilter === "ALL" ? tasks : tasks.filter((task) => task.status === statusFilter),
    [tasks, statusFilter],
  );

  if (tasks.length === 0) {
    return (
      <GithubEmptyState
        compact
        variant="no-results"
        title="No tasks yet"
        description="Nothing has been broken out into a DevTunnel task on this project so far. The repository's open issues are still a good place to look for something to pick up."
        primaryAction={{
          label: "Browse issues on GitHub",
          href: `${repositoryUrl}/issues`,
          external: true,
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((filter) => {
          const count = counts[filter.value] ?? 0;
          const isActive = filter.value === statusFilter;
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              aria-pressed={isActive}
              className={`inline-flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1 text-[12px] transition-colors ${
                isActive
                  ? "border-border bg-surface-raised text-text"
                  : "border-border-subtle bg-transparent text-text-dim hover:text-text-muted"
              }`}
            >
              {filter.label}
              <span className="text-[11px] text-text-faint">{count}</span>
            </button>
          );
        })}
      </div>

      {visibleTasks.length === 0 ? (
        <p className="m-0 rounded-[8px] border border-dashed border-border-subtle px-4 py-6 text-center text-[12.5px] text-text-muted">
          No tasks with this status. Try another filter.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {visibleTasks.map((task) => {
            const visibleTech = task.techStack.slice(0, MAX_VISIBLE_TECH);
            const hiddenTechCount = task.techStack.length - visibleTech.length;

            return (
              <li
                key={task.id}
                className="rounded-[9px] border border-border-subtle bg-surface-raised p-3.5 transition-colors hover:border-border"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/projects/${projectSlug}/tasks/${task.id}`}
                    className="min-w-0 flex-1 text-[13px] font-medium text-text hover:text-accent"
                  >
                    {task.title}
                  </Link>
                  <AdminTaskStatusBadge status={task.status} />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-text-faint">
                  {task.roles.length > 0 ? (
                    <span>{task.roles.map((role) => DEVELOPER_ROLE_LABEL[role]).join(", ")}</span>
                  ) : null}

                  {task.difficulty ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{EXPERIENCE_LEVEL_LABEL[task.difficulty]}</span>
                    </>
                  ) : null}

                  <span aria-hidden="true">·</span>
                  <span>
                    {task.activeContributorCount.toLocaleString()} working
                    {task.completedContributorCount > 0
                      ? `, ${task.completedContributorCount.toLocaleString()} completed`
                      : ""}
                  </span>

                  {task.githubIssue ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <a
                        href={task.githubIssue.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 font-mono hover:text-accent"
                      >
                        <IssueIcon className="h-3 w-3 shrink-0" />#{task.githubIssue.number}
                      </a>
                    </>
                  ) : null}
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {visibleTech.map((tag) => (
                      <span
                        key={tag}
                        className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10.5px] ${getTechTagClasses(tag)}`}
                      >
                        {tag}
                      </span>
                    ))}
                    {hiddenTechCount > 0 ? (
                      <span className="text-[10.5px] text-text-faint">+{hiddenTechCount}</span>
                    ) : null}
                  </div>

                  <Link
                    href={`/projects/${projectSlug}/tasks/${task.id}`}
                    className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-text-faint hover:text-accent"
                  >
                    View task
                    <ChevronRightIcon className="h-3 w-3" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
