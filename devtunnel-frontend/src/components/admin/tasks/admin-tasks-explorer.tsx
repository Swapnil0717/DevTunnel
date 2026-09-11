"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import { FilterSelect } from "@/components/ui/filter-select";
import { AdminTasksTable } from "./admin-tasks-table";
import { AdminDeletedTasksTable } from "./admin-deleted-tasks-table";
import {
  DEVELOPER_ROLE_LABEL,
  EXPERIENCE_LEVEL_LABEL,
} from "@/lib/onboarding/types";
import type {
  DeveloperRole,
  ExperienceLevel,
} from "@/lib/onboarding/types";
import type {
  AdminTaskStatus,
  AdminTaskSummary,
} from "@/lib/admin/tasks/types";

type StatusFilter = "ALL" | AdminTaskStatus;
type RoleFilter = "ALL" | DeveloperRole;
type DifficultyFilter = "ALL" | ExperienceLevel;

const STATUS_FILTERS: {
  value: StatusFilter;
  label: string;
}[] = [
  { value: "ALL", label: "All statuses" },
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];

const ROLE_FILTERS: {
  value: RoleFilter;
  label: string;
}[] = [
  { value: "ALL", label: "All roles" },
  ...(Object.keys(DEVELOPER_ROLE_LABEL) as DeveloperRole[]).map(
    (role) => ({
      value: role,
      label: DEVELOPER_ROLE_LABEL[role],
    }),
  ),
];

const DIFFICULTY_FILTERS: {
  value: DifficultyFilter;
  label: string;
}[] = [
  { value: "ALL", label: "All difficulties" },
  ...(Object.keys(EXPERIENCE_LEVEL_LABEL) as ExperienceLevel[]).map(
    (level) => ({
      value: level,
      label: EXPERIENCE_LEVEL_LABEL[level],
    }),
  ),
];

/**
 * Client-side filter bar for `/admin/tasks` (admin_workflow.txt, section
 * 13 — Task Page: "Show all DevTunnel tasks") plus the section 15
 * "Deleted in DevTunnel" view, both driven by one already-fetched
 * `GET /admin/tasks` list (`lib/admin/tasks/api.ts`) — narrowing it in
 * the browser is a UX improvement on top of one real data source, never
 * a second fabricated one (Frontend_Development_Rules.txt rule 58).
 *
 * Filters, matching what the requester asked for beyond section 13's
 * base table — level of difficulty, role, tech stack, author, GitHub
 * repository:
 * - Search — matches task title, project name, GitHub repository,
 *   issue title, and both the project's author and the GitHub issue's
 *   author (username or display name).
 * - Status — the fixed `AdminTaskStatus` enum, same convention as
 *   `AdminProjectsExplorer`'s status select.
 * - Role / Difficulty — the fixed `DeveloperRole` / `ExperienceLevel`
 *   enums already defined in `lib/onboarding/types.ts`, not a second
 *   taxonomy invented here.
 * - Tech stack / Repository / Author — option lists are *derived from
 *   the fetched tasks themselves* (`useMemo` below), never a hardcoded
 *   guess at what values might exist (rule 58).
 *
 * "Deleted in DevTunnel" (section 15) is modeled as a toggle rather than
 * a separate route: same underlying `GET /admin/tasks` list, split
 * client-side on `deletedAt`, and rendered through the dedicated
 * `AdminDeletedTasksTable` (Issue #, Issue Title, Project, Deleted At,
 * Deletion Status — section 15's own column list, not the active-tasks
 * table's columns) — a deleted task's GitHub issue still exists, so it
 * has nothing meaningful to show for Role/Difficulty/Contributors/
 * Submissions.
 *
 * This is authenticated Admin application UI (`noIndex: true` on the
 * page), not public content, so filtering client-side after a full
 * server fetch has no crawlability impact
 * (Frontend_Development_Rules.txt rule 18).
 *
 * `FilterSelect` (the themed listbox from `components/ui/filter-select`)
 * has no built-in caption — its trigger shows the selected option's own
 * label — so each filter here gets its own small visible `<label>`
 * above it, same idea as the `sr-only` label on the search input but
 * shown on screen since "Status" / "Role" / etc. aren't otherwise
 * implied by the selected value alone.
 */
export function AdminTasksExplorer({
  tasks,
  /** Pre-selected from `?project=` when arriving via a project's "Tasks" action. */
  initialProjectSlug = "ALL",
}: {
  tasks: AdminTaskSummary[];
  initialProjectSlug?: string;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] =
    useState<StatusFilter>("ALL");
  const [role, setRole] =
    useState<RoleFilter>("ALL");
  const [difficulty, setDifficulty] =
    useState<DifficultyFilter>("ALL");
  const [techStack, setTechStack] = useState("ALL");
  const [repository, setRepository] = useState("ALL");
  const [author, setAuthor] = useState("ALL");
  const [projectSlug, setProjectSlug] =
    useState(initialProjectSlug);
  const [showDeleted, setShowDeleted] =
    useState(false);

  const activeTasks = useMemo(
    () => tasks.filter((task) => !task.deletedAt),
    [tasks],
  );

  const deletedTasks = useMemo(
    () => tasks.filter((task) => Boolean(task.deletedAt)),
    [tasks],
  );

  const techStackOptions = useMemo(() => {
    const values = new Set<string>();

    for (const task of activeTasks) {
      for (const value of task.techStack) {
        values.add(value);
      }
    }

    return Array.from(values).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [activeTasks]);

  const repositoryOptions = useMemo(() => {
    const values = new Set<string>();

    for (const task of activeTasks) {
      values.add(task.project.repositoryFullName);
    }

    return Array.from(values).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [activeTasks]);

  const authorOptions = useMemo(() => {
    const values = new Set<string>();

    for (const task of activeTasks) {
      values.add(task.project.author.username);
    }

    return Array.from(values).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [activeTasks]);

  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();

    for (const task of activeTasks) {
      if (!seen.has(task.project.slug)) {
        seen.set(
          task.project.slug,
          task.project.name,
        );
      }
    }

    return Array.from(seen.entries()).sort((a, b) =>
      a[1].localeCompare(b[1]),
    );
  }, [activeTasks]);

  const filteredTasks = useMemo(() => {
    const normalizedQuery =
      query.trim().toLowerCase();

    return activeTasks.filter((task) => {
      if (
        status !== "ALL" &&
        task.status !== status
      ) {
        return false;
      }

      if (
        role !== "ALL" &&
        task.role !== role
      ) {
        return false;
      }

      if (
        difficulty !== "ALL" &&
        task.difficulty !== difficulty
      ) {
        return false;
      }

      if (
        techStack !== "ALL" &&
        !task.techStack.includes(techStack)
      ) {
        return false;
      }

      if (
        repository !== "ALL" &&
        task.project.repositoryFullName !== repository
      ) {
        return false;
      }

      if (
        author !== "ALL" &&
        task.project.author.username !== author
      ) {
        return false;
      }

      if (
        projectSlug !== "ALL" &&
        task.project.slug !== projectSlug
      ) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const haystack = [
        task.title,
        task.project.name,
        task.project.repositoryFullName,
        task.project.author.username,
        task.project.author.name ?? "",
        task.githubIssue?.title ?? "",
        task.githubIssue?.author.username ?? "",
        task.githubIssue?.author.name ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(
        normalizedQuery,
      );
    });
  }, [
    activeTasks,
    query,
    status,
    role,
    difficulty,
    techStack,
    repository,
    author,
    projectSlug,
  ]);

  const hasActiveFilters =
    query.trim().length > 0 ||
    status !== "ALL" ||
    role !== "ALL" ||
    difficulty !== "ALL" ||
    techStack !== "ALL" ||
    repository !== "ALL" ||
    author !== "ALL" ||
    projectSlug !== "ALL";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border-subtle pb-3">
        <button
          type="button"
          onClick={() => setShowDeleted(false)}
          aria-pressed={!showDeleted}
          className={`rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            !showDeleted
              ? "bg-surface-raised text-text"
              : "text-text-faint hover:text-text-muted"
          }`}
        >
          Tasks ({activeTasks.length})
        </button>

        <button
          type="button"
          onClick={() => setShowDeleted(true)}
          aria-pressed={showDeleted}
          className={`rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
            showDeleted
              ? "bg-surface-raised text-text"
              : "text-text-faint hover:text-text-muted"
          }`}
        >
          Deleted in DevTunnel (
          {deletedTasks.length})
        </button>
      </div>

      {showDeleted ? (
        deletedTasks.length === 0 ? (
          <SectionMessage>
            No DevTunnel tasks have been deleted while
            their GitHub issue remained.
          </SectionMessage>
        ) : (
          <AdminDeletedTasksTable
            tasks={deletedTasks}
          />
        )
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-3">
            <div className="relative w-full sm:max-w-xs">
              <label
                htmlFor="admin-tasks-search"
                className="sr-only"
              >
                Search tasks by title, project,
                repository, or author
              </label>

              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />

              <input
                id="admin-tasks-search"
                name="admin-tasks-search"
                type="search"
                value={query}
                onChange={(event) =>
                  setQuery(event.target.value)
                }
                placeholder="Search by task, project, repository, or author"
                className="w-full rounded-[8px] border border-border bg-surface py-2 pl-8 pr-3 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="admin-tasks-status"
                  className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
                >
                  Status
                </label>
                <FilterSelect
                  id="admin-tasks-status"
                  value={status}
                  onChange={(value) =>
                    setStatus(
                      value as StatusFilter,
                    )
                  }
                  options={STATUS_FILTERS}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="admin-tasks-role"
                  className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
                >
                  Role
                </label>
                <FilterSelect
                  id="admin-tasks-role"
                  value={role}
                  onChange={(value) =>
                    setRole(value as RoleFilter)
                  }
                  options={ROLE_FILTERS}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="admin-tasks-difficulty"
                  className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
                >
                  Difficulty
                </label>
                <FilterSelect
                  id="admin-tasks-difficulty"
                  value={difficulty}
                  onChange={(value) =>
                    setDifficulty(
                      value as DifficultyFilter,
                    )
                  }
                  options={DIFFICULTY_FILTERS}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="admin-tasks-techstack"
                  className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
                >
                  Tech stack
                </label>
                <FilterSelect
                  id="admin-tasks-techstack"
                  value={techStack}
                  onChange={setTechStack}
                  options={[
                    {
                      value: "ALL",
                      label: "All tech stacks",
                    },
                    ...techStackOptions.map(
                      (value) => ({
                        value,
                        label: value,
                      }),
                    ),
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="admin-tasks-repository"
                  className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
                >
                  Repository
                </label>
                <FilterSelect
                  id="admin-tasks-repository"
                  value={repository}
                  onChange={setRepository}
                  options={[
                    {
                      value: "ALL",
                      label: "All repositories",
                    },
                    ...repositoryOptions.map(
                      (value) => ({
                        value,
                        label: value,
                      }),
                    ),
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="admin-tasks-author"
                  className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
                >
                  Author
                </label>
                <FilterSelect
                  id="admin-tasks-author"
                  value={author}
                  onChange={setAuthor}
                  options={[
                    {
                      value: "ALL",
                      label: "All authors",
                    },
                    ...authorOptions.map(
                      (value) => ({
                        value,
                        label: `@${value}`,
                      }),
                    ),
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="admin-tasks-project"
                  className="text-[11px] font-normal uppercase tracking-wide text-text-faint"
                >
                  Project
                </label>
                <FilterSelect
                  id="admin-tasks-project"
                  value={projectSlug}
                  onChange={setProjectSlug}
                  options={[
                    {
                      value: "ALL",
                      label: "All projects",
                    },
                    ...projectOptions.map(
                      ([slug, name]) => ({
                        value: slug,
                        label: name,
                      }),
                    ),
                  ]}
                />
              </div>
            </div>
          </div>

          <p
            className="mb-3 text-[11.5px] text-text-faint"
            aria-live="polite"
          >
            Showing {filteredTasks.length} of{" "}
            {activeTasks.length} task
            {activeTasks.length === 1
              ? ""
              : "s"}
          </p>

          {filteredTasks.length === 0 ? (
            <SectionMessage>
              {hasActiveFilters
                ? "No tasks match your search or the selected filters. Try different search terms or filters."
                : "No tasks have been onboarded yet."}
            </SectionMessage>
          ) : (
            <AdminTasksTable
              tasks={filteredTasks}
            />
          )}
        </>
      )}
    </div>
  );
}
