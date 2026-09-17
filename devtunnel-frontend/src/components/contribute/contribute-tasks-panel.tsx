"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AdminTaskStatusBadge } from "@/components/admin/tasks/admin-task-status-badge";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { IssueIcon, ChevronRightIcon, SearchIcon } from "@/components/layout/nav-icons";
import { getTechTagClasses } from "@/lib/home/tag-style";
import {
  DEVELOPER_ROLE_LABEL,
  EXPERIENCE_LEVEL_LABEL,
} from "@/lib/onboarding/types";
import type { DeveloperRole, ExperienceLevel } from "@/lib/onboarding/types";
import type { Task, TaskStatus } from "@/lib/tasks/types";
import type { ContributeTargetKind } from "@/lib/contribute/types";

type StatusFilter = "ALL" | TaskStatus;
type RoleFilter = "ALL" | DeveloperRole;
type DifficultyFilter = "ALL" | ExperienceLevel;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];

/** How many tech chips a row shows inline before collapsing into "+N". */
const MAX_VISIBLE_TECH = 3;

/**
 * "DevTunnel tasks" tab of the Contribute page — every task curated on
 * this project, which is the thing joining actually unlocked.
 *
 * Related to `ProjectTasksPanel` (`components/projects/project-tasks-panel.tsx`)
 * but not the same panel, and deliberately so. That one is a preview
 * inside the View Project page's tab strip, where the task list is one of
 * four things competing for the column, so it filters on status alone.
 * This is the page someone lands on *having decided to contribute*, so
 * the question changed from "does this project have tasks?" to "which of
 * these is mine?" — hence the role and difficulty filters, which are the
 * same two things onboarding already asked the contributor about
 * (`lib/onboarding/types.ts`), and a title search for the case where they
 * already know what they're looking for.
 *
 * Still one list, narrowed in the browser — no second fetch, and every
 * count on a filter chip is derived from the real rows (rule 38).
 * Rows link to the task's own page, the same destination `TaskRow`,
 * `TasksTable` and `ProjectTasksPanel` already use, with the underlying
 * GitHub issue reachable separately.
 *
 * For a tool, `tasks` is always empty and the panel says why: DevTunnel
 * tasks hang off a project, never a tool (sql/017), so an empty list here
 * is a fact about how DevTunnel works, not a backlog waiting to be
 * filled. Pretending otherwise would leave someone refreshing a page that
 * is never going to fill up.
 */
export function ContributeTasksPanel({
  targetKind,
  projectSlug,
  tasks,
  repositoryUrl,
}: {
  targetKind: ContributeTargetKind;
  projectSlug: string;
  tasks: Task[];
  repositoryUrl: string | null;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("ALL");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("ALL");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const byStatus: Record<string, number> = { ALL: tasks.length };
    for (const task of tasks) {
      byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    }
    return byStatus;
  }, [tasks]);

  /** Only offer a role/difficulty that at least one task on this project actually has. */
  const availableRoles = useMemo(() => {
    const roles = new Set<DeveloperRole>();
    for (const task of tasks) for (const role of task.roles) roles.add(role);
    return Array.from(roles);
  }, [tasks]);

  const availableDifficulties = useMemo(() => {
    const levels = new Set<ExperienceLevel>();
    for (const task of tasks) if (task.difficulty) levels.add(task.difficulty);
    return Array.from(levels);
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return tasks.filter((task) => {
      if (statusFilter !== "ALL" && task.status !== statusFilter) return false;
      if (roleFilter !== "ALL" && !task.roles.includes(roleFilter)) return false;
      if (difficultyFilter !== "ALL" && task.difficulty !== difficultyFilter) return false;
      if (normalizedQuery && !task.title.toLowerCase().includes(normalizedQuery)) return false;
      return true;
    });
  }, [tasks, statusFilter, roleFilter, difficultyFilter, query]);

  if (targetKind === "tool") {
    return (
      <GithubEmptyState
        compact
        variant="no-results"
        title="Tools don't carry DevTunnel tasks"
        description="Tasks are curated on DevTunnel projects. A tool points straight at its own repository, so the open issues there are what's available to pick up."
        primaryAction={
          repositoryUrl
            ? { label: "Browse open issues", href: `${repositoryUrl}/issues`, external: true }
            : undefined
        }
        secondaryAction={{ label: "Browse DevTunnel projects", href: "/projects" }}
      />
    );
  }

  if (tasks.length === 0) {
    return (
      <GithubEmptyState
        compact
        variant="no-results"
        title="No tasks curated yet"
        description="Nothing on this project has been broken out into a DevTunnel task so far. The repository's own open issues are still the place to find something to pick up."
        primaryAction={
          repositoryUrl
            ? { label: "Browse issues on GitHub", href: `${repositoryUrl}/issues`, external: true }
            : undefined
        }
        secondaryAction={{ label: "See all tasks", href: "/tasks" }}
      />
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {STATUS_FILTERS.map((filter) => {
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
              <span className="text-[11px] text-text-faint">{counts[filter.value] ?? 0}</span>
            </button>
          );
        })}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="flex min-w-[180px] flex-1 items-center gap-2 rounded-[8px] border border-border-subtle bg-bg px-2.5 py-1.5">
          <SearchIcon className="h-3.5 w-3.5 shrink-0 text-text-faint" />
          <span className="sr-only">Search tasks by title</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks"
            className="min-w-0 flex-1 border-0 bg-transparent text-[12.5px] text-text outline-none placeholder:text-text-faint"
          />
        </label>

        {availableRoles.length > 0 ? (
          <label className="flex items-center gap-1.5 text-[12px] text-text-faint">
            <span className="sr-only">Filter tasks by role</span>
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
              className="rounded-[8px] border border-border-subtle bg-bg px-2.5 py-1.5 text-[12.5px] text-text outline-none"
            >
              <option value="ALL">Any role</option>
              {availableRoles.map((role) => (
                <option key={role} value={role}>
                  {DEVELOPER_ROLE_LABEL[role]}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {availableDifficulties.length > 0 ? (
          <label className="flex items-center gap-1.5 text-[12px] text-text-faint">
            <span className="sr-only">Filter tasks by difficulty</span>
            <select
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value as DifficultyFilter)}
              className="rounded-[8px] border border-border-subtle bg-bg px-2.5 py-1.5 text-[12.5px] text-text outline-none"
            >
              <option value="ALL">Any difficulty</option>
              {availableDifficulties.map((level) => (
                <option key={level} value={level}>
                  {EXPERIENCE_LEVEL_LABEL[level]}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <p className="m-0 mb-2.5 text-[11.5px] text-text-faint">
        Showing {visibleTasks.length.toLocaleString()} of {tasks.length.toLocaleString()} tasks
      </p>

      {visibleTasks.length === 0 ? (
        <p className="m-0 rounded-[8px] border border-dashed border-border-subtle px-4 py-6 text-center text-[12.5px] text-text-muted">
          No task matches those filters. Widen the role or difficulty, or clear the search.
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
