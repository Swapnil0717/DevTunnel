"use client";

import { useEffect, useMemo, useState } from "react";
import { SearchIcon } from "@/components/layout/nav-icons";
import { SectionMessage } from "@/components/home/section-message";
import {
  fetchOnboardingProjects,
  selectOnboardingProject,
  TaskOnboardingApiError,
} from "@/lib/admin/task-onboarding/api";
import type { TaskOnboardingDraft, TaskOnboardingProjectOption } from "@/lib/admin/task-onboarding/types";

interface ProjectSelectionStepProps {
  draft: TaskOnboardingDraft | null;
  onSelected: (draft: TaskOnboardingDraft) => void;
}

/**
 * Step 1 of Task Onboarding — "Project Selection" (admin_workflow.txt,
 * "Step 1 — Project Selection").
 *
 * "Searchable project selector" over `GET /admin/tasks/onboarding/projects`
 * — "Only active/eligible DevTunnel projects should be selectable", so
 * this renders exactly what that endpoint returns rather than the full
 * `/admin/projects` list. Picking a project calls
 * `POST /admin/tasks/onboarding`, which is what actually creates the
 * draft server-side; nothing before that point has a `draft.id` to carry
 * into later steps.
 */
export function ProjectSelectionStep({ draft, onSelected }: ProjectSelectionStepProps) {
  const [projects, setProjects] = useState<TaskOnboardingProjectOption[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);

  useEffect(() => {
    fetchOnboardingProjects()
      .then(setProjects)
      .catch(() => setLoadError(true));
  }, []);

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) =>
      `${project.name} ${project.repositoryFullName}`.toLowerCase().includes(normalized),
    );
  }, [projects, query]);

  async function handleSelect(project: TaskOnboardingProjectOption) {
    setSelectingId(project.id);
    setSelectError(null);
    try {
      const next = await selectOnboardingProject(project.id, draft?.id);
      onSelected(next);
    } catch (error) {
      setSelectError(
        error instanceof TaskOnboardingApiError
          ? "We couldn't select that project. Please try again."
          : "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setSelectingId(null);
    }
  }

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Select a project</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        Choose the DevTunnel project this task belongs to. Its GitHub
        issues load automatically once you pick one.
      </p>

      <div className="relative mb-4">
        <label htmlFor="task-onboarding-project-search" className="sr-only">
          Search projects by name or repository
        </label>
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-faint" />
        <input
          id="task-onboarding-project-search"
          name="task-onboarding-project-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by project or repository"
          className="w-full rounded-[8px] border border-border bg-surface py-2 pl-8 pr-3 text-[12.5px] text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>

      {selectError ? (
        <p role="alert" className="m-0 mb-4 text-[12.5px] text-status-error-label">
          {selectError}
        </p>
      ) : null}

      {loadError ? (
        <SectionMessage>
          Projects aren&apos;t available right now — check back soon.
        </SectionMessage>
      ) : !projects ? (
        <p className="m-0 text-[12.5px] text-text-dim">Loading projects…</p>
      ) : filteredProjects.length === 0 ? (
        <SectionMessage>
          {projects.length === 0
            ? "No projects are eligible for task onboarding yet. Onboard a project first."
            : "No projects match your search."}
        </SectionMessage>
      ) : (
        <ul role="radiogroup" aria-label="Project" className="m-0 flex list-none flex-col gap-2 p-0">
          {filteredProjects.map((project) => {
            const isSelected = draft?.project?.id === project.id;
            const isSelecting = selectingId === project.id;
            return (
              <li key={project.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => handleSelect(project)}
                  disabled={isSelecting}
                  className={`flex w-full items-center justify-between gap-3 rounded-md border px-3.5 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 ${
                    isSelected
                      ? "border-accent bg-surface-selected"
                      : "border-border bg-surface hover:border-border-subtle"
                  }`}
                >
                  <span>
                    <span className="block text-[13px] font-medium text-text">{project.name}</span>
                    <span className="mt-0.5 block font-mono text-[11.5px] text-text-muted">
                      {project.repositoryFullName}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11.5px] text-text-faint">
                    {isSelecting
                      ? "Selecting…"
                      : isSelected
                        ? "Selected"
                        : project.primaryLanguage ?? ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}