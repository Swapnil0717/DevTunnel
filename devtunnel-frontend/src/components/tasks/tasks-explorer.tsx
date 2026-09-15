"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { FilterSelect } from "@/components/ui/filter-select";
import { PagePaginationControls } from "@/components/admin/page-pagination-controls";
import { usePagePagination } from "@/lib/admin/use-page-pagination";
import { TasksTable } from "./tasks-table";
import { DEVELOPER_ROLE_LABEL, EXPERIENCE_LEVEL_LABEL } from "@/lib/onboarding/types";
import type { DeveloperRole, ExperienceLevel } from "@/lib/onboarding/types";
import type { Task, TaskStatus } from "@/lib/tasks/types";

type StatusFilter = "ALL" | TaskStatus;
type RoleFilter = "ALL" | DeveloperRole;
type DifficultyFilter = "ALL" | ExperienceLevel;

/** Every task page paginates 10-per-page — a smaller page than the Admin Tasks page's 20, per this page's own spec. */
const TASKS_PAGE_SIZE = 10;

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];

/**
 * Role and Difficulty options, sourced from the exact same
 * `DEVELOPER_ROLE_LABEL` / `EXPERIENCE_LEVEL_LABEL` lookups the
 * onboarding form itself uses (`lib/onboarding/types.ts`) — these two
 * filters are literally the same two choices a contributor already made
 * during onboarding, just applied here to narrow the Tasks list instead.
 */
const ROLE_FILTERS: { value: RoleFilter; label: string }[] = [
  { value: "ALL", label: "All roles" },
  ...(Object.keys(DEVELOPER_ROLE_LABEL) as DeveloperRole[]).map((role) => ({
    value: role,
    label: DEVELOPER_ROLE_LABEL[role],
  })),
];

const DIFFICULTY_FILTERS: { value: DifficultyFilter; label: string }[] = [
  { value: "ALL", label: "All difficulties" },
  ...(Object.keys(EXPERIENCE_LEVEL_LABEL) as ExperienceLevel[]).map((level) => ({
    value: level,
    label: EXPERIENCE_LEVEL_LABEL[level],
  })),
];

/**
 * Client-side search + filter bar for `/tasks` ("Tasks"), driven by the
 * fully-fetched `GET /tasks` list (`lib/tasks/api.ts`) — narrowed here,
 * then paginated 10-per-page, never a second fabricated data source
 * (Frontend_Development_Rules.txt rule 58). Same convention as
 * `AdminTasksExplorer`, minus the admin-only Deleted-tasks tab and
 * Edit/Delete actions.
 *
 * Role, Difficulty, and Tech stack are the three filters that map
 * directly onto the onboarding form's own questions (`developerRoles`,
 * `experienceLevel`, `technologies`/`interests` — `lib/onboarding/
 * types.ts`); Project is kept alongside them the same way `IssuesExplorer`
 * keeps one for browsing open issues.
 *
 * `usePagePagination` and `PagePaginationControls` are reused from the
 * Admin Portal rather than duplicated — both are generic, role-agnostic
 * pagination utilities over an already-filtered in-memory array with no
 * admin-only coupling (rule 51). Only the page size (`TASKS_PAGE_SIZE`)
 * differs from the Admin Tasks page's own 20-per-page default.
 */
export function TasksExplorer({ tasks }: { tasks: Task[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [role, setRole] = useState<RoleFilter>("ALL");
  const [difficulty, setDifficulty] = useState<DifficultyFilter>("ALL");
  const [techStack, setTechStack] = useState("ALL");
  const [projectSlug, setProjectSlug] = useState("ALL");

  const techStackOptions = useMemo(() => {
    const values = new Set<string>();
    for (const task of tasks) {
      for (const value of task.techStack) values.add(value);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const task of tasks) {
      if (!seen.has(task.project.slug)) {
        seen.set(task.project.slug, task.project.name);
      }
    }
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return tasks.filter((task) => {
      if (status !== "ALL" && task.status !== status) return false;
      if (role !== "ALL" && !task.roles.includes(role)) return false;
      if (difficulty !== "ALL" && task.difficulty !== difficulty) return false;
      if (techStack !== "ALL" && !task.techStack.includes(techStack)) return false;
      if (projectSlug !== "ALL" && task.project.slug !== projectSlug) return false;

      if (!normalizedQuery) return true;

      const haystack = [
        task.title,
        task.project.name,
        task.project.repositoryFullName,
        task.githubIssue?.title ?? "",
        task.githubIssue ? `#${task.githubIssue.number}` : "",
        ...task.techStack,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [tasks, query, status, role, difficulty, techStack, projectSlug]);

  const hasActiveFilters =
    query.trim().length > 0 ||
    status !== "ALL" ||
    role !== "ALL" ||
    difficulty !== "ALL" ||
    techStack !== "ALL" ||
    projectSlug !== "ALL";

  const paged = usePagePagination(filteredTasks, TASKS_PAGE_SIZE);

  return (
    <div>
      <div className="mb-3 flex flex-col gap-3">
        <div className="relative w-full sm:max-w-xs">
          <label htmlFor="tasks-search" className="sr-only">
            Search tasks by title, project, repository, or tech stack
          </label>

          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />

          <input
            id="tasks-search"
            name="tasks-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by task, project, repository, or tech stack"
            className="w-full rounded-[8px] border border-border bg-surface py-2 pl-8 pr-3 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="tasks-role"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Role
            </label>
            <FilterSelect
              id="tasks-role"
              value={role}
              onChange={(value) => setRole(value as RoleFilter)}
              options={ROLE_FILTERS}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="tasks-difficulty"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Difficulty
            </label>
            <FilterSelect
              id="tasks-difficulty"
              value={difficulty}
              onChange={(value) => setDifficulty(value as DifficultyFilter)}
              options={DIFFICULTY_FILTERS}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="tasks-techstack"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Tech stack
            </label>
            <FilterSelect
              id="tasks-techstack"
              value={techStack}
              onChange={setTechStack}
              options={[
                { value: "ALL", label: "All tech stacks" },
                ...techStackOptions.map((value) => ({ value, label: value })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="tasks-project"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Project
            </label>
            <FilterSelect
              id="tasks-project"
              value={projectSlug}
              onChange={setProjectSlug}
              options={[
                { value: "ALL", label: "All projects" },
                ...projectOptions.map(([slug, name]) => ({ value: slug, label: name })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="tasks-status"
              className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
            >
              Status
            </label>
            <FilterSelect
              id="tasks-status"
              value={status}
              onChange={(value) => setStatus(value as StatusFilter)}
              options={STATUS_FILTERS}
            />
          </div>
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <SectionMessage>
          {hasActiveFilters
            ? "No tasks match your search or the selected filters. Try different search terms or filters."
            : "No tasks have been onboarded yet."}
        </SectionMessage>
      ) : (
        <>
          <TasksTable tasks={paged.pageItems} />
          <PagePaginationControls
            page={paged.page}
            totalPages={paged.totalPages}
            onPageChange={paged.setPage}
            rangeStart={paged.rangeStart}
            rangeEnd={paged.rangeEnd}
            totalItems={paged.totalItems}
            itemLabel="task"
          />
        </>
      )}
    </div>
  );
}
