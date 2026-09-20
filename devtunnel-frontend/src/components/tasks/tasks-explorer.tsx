"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { FilterSelect } from "@/components/ui/filter-select";
import { PagePaginationControls } from "@/components/admin/page-pagination-controls";
import { usePagePagination } from "@/lib/admin/use-page-pagination";
import { useAuth } from "@/lib/auth/use-auth";
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
  { value: "IN_REVIEW", label: "In review" },
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
 *
 * Filters start at "All" — every task is visible on first load, same as
 * before onboarding data was wired in at all. Role/Difficulty/Tech
 * stack still don't just *offer* the same choices the onboarding form
 * asked (see `ROLE_FILTERS`/`DIFFICULTY_FILTERS` above); a "Match my
 * profile" toggle (`profileMatch` below, sourced from `useAuth().user.
 * developerRoles` / `.experienceLevel` / `.technologies` — the exact
 * fields `AuthUser` documents as "every field asked for during
 * onboarding") lets the contributor apply those three filters in one
 * click instead of hunting for their own role/difficulty/stack across
 * three dropdowns — but it's opt-in, not the default view. Only the
 * *first* saved value is used per filter — these are single-select
 * dropdowns, `developerRoles`/`technologies` are multi-select
 * onboarding answers — and only when that value is also present in
 * this task list's own options (`techStackOptions` below); a
 * preference for a tech stack nothing here currently uses is left out
 * of the toggle rather than silently offering a dead option. The
 * toggle only appears when the contributor actually has a matching
 * profile answer to apply.
 *
 * Exception: Full Stack (`isFullStack` below). A Full Stack contributor
 * can pick up a frontend-only, backend-only, docs, testing, or DevOps
 * task just as well as one tagged Full Stack, so matching Role to
 * "Full stack developer" would hide most of what they're actually
 * qualified for — "can handle everything" means Role stays at "All
 * roles" for them, even while Difficulty/Tech stack still apply from
 * their profile as normal. This exception also covers a contributor
 * *manually* selecting "Full stack developer" from the Role dropdown
 * itself (see `filteredTasks` below) — either way, Role = FULL_STACK
 * means "any role-tagged task", never "only tasks literally tagged
 * FULL_STACK".
 */
export function TasksExplorer({ tasks }: { tasks: Task[] }) {
  const { user } = useAuth();

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

  /**
   * Full Stack contributors can pick up frontend-only, backend-only,
   * documentation, testing, or DevOps tasks just as well as anything
   * tagged Full Stack — narrowing Role to "Full stack developer" would
   * actually *hide* every task tagged only FRONTEND/BACKEND/etc, the
   * opposite of "can handle everything." So Role only narrows anything
   * for a single, non-Full-Stack developerRole; Full Stack leaves Role
   * at "All roles" instead for the auto "Match my profile" flow.
   */
  const isFullStack = user?.developerRoles.includes("FULL_STACK") ?? false;

  /**
   * The contributor's own onboarding answers, narrowed to only the
   * ones that are actually selectable right now (a saved tech-stack
   * preference nothing in this task list uses is left as `null` rather
   * than offered as a dead filter). `null` across the board hides the
   * "Match my profile" toggle entirely — nothing to apply.
   */
  const profileMatch = useMemo(
    () => ({
      role: isFullStack ? null : user?.developerRoles[0] ?? null,
      difficulty: user?.experienceLevel ?? null,
      techStack: user?.technologies.find((value) => techStackOptions.includes(value)) ?? null,
    }),
    [user, isFullStack, techStackOptions],
  );

  const hasProfileMatch =
    profileMatch.role !== null || profileMatch.difficulty !== null || profileMatch.techStack !== null;

  const isFilteredToProfile =
    (profileMatch.role === null || role === profileMatch.role) &&
    (isFullStack ? role === "ALL" : true) &&
    (profileMatch.difficulty === null || difficulty === profileMatch.difficulty) &&
    (profileMatch.techStack === null || techStack === profileMatch.techStack) &&
    hasProfileMatch &&
    (role !== "ALL" || difficulty !== "ALL" || techStack !== "ALL");

  function applyProfileMatch() {
    if (isFullStack) {
      setRole("ALL");
    } else if (profileMatch.role !== null) {
      setRole(profileMatch.role);
    }
    if (profileMatch.difficulty !== null) setDifficulty(profileMatch.difficulty);
    if (profileMatch.techStack !== null) setTechStack(profileMatch.techStack);
  }

  function clearProfileMatch() {
    setRole("ALL");
    setDifficulty("ALL");
    setTechStack("ALL");
  }

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
      // A Full Stack task list should include every role-tagged task, not
      // only tasks literally tagged FULL_STACK — this applies whether
      // "Full stack developer" got into the Role dropdown via manual
      // selection or via `applyProfileMatch` above (in practice the
      // latter never sets `role` to FULL_STACK — see `isFullStack` — but
      // the check is written against `role` itself so both paths behave
      // identically, same "can handle everything" reasoning documented
      // on `isFullStack`).
      if (role !== "ALL") {
        if (role === "FULL_STACK") {
          if (task.roles.length === 0) return false;
        } else if (!task.roles.includes(role)) {
          return false;
        }
      }
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

        {hasProfileMatch ? (
          isFilteredToProfile ? (
            <p className="m-0 flex items-center gap-2 text-[11.5px] text-text-faint">
              Filtered to your profile.
              <button
                type="button"
                onClick={clearProfileMatch}
                className="font-medium text-accent hover:underline"
              >
                Show all tasks
              </button>
            </p>
          ) : (
            <div>
              <button
                type="button"
                onClick={applyProfileMatch}
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-border bg-surface px-3 py-1.5 text-[11.5px] font-medium text-text-secondary transition-colors hover:border-accent/40 hover:text-accent"
              >
                Match my profile
              </button>
            </div>
          )
        ) : null}

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