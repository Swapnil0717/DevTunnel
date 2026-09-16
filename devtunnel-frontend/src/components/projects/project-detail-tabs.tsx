"use client";

import { useState } from "react";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { ProjectTasksPanel } from "@/components/projects/project-tasks-panel";
import { ProjectIssuesPanel } from "@/components/projects/project-issues-panel";
import { GridIcon, FileIcon, ChecklistIcon, IssueIcon } from "@/components/layout/nav-icons";
import { getTechTagClasses } from "@/lib/home/tag-style";
import type { DevtunnelProjectDetail } from "@/lib/projects/types";

const TABS = [
  { id: "info", label: "Project Info", icon: GridIcon },
  { id: "readme", label: "README", icon: FileIcon },
  { id: "tasks", label: "Tasks", icon: ChecklistIcon },
  { id: "issues", label: "All Issues", icon: IssueIcon },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * View Project page's tabbed body — Project Info, README, Tasks, All
 * Issues.
 *
 * Real, accessible tab UI (`role="tablist"`/`role="tab"`/
 * `role="tabpanel"`), the same wiring `ProfileTabs` and
 * `GithubProjectDetailTabs` already use, so keyboard and screen-reader
 * behavior stays consistent across the app instead of each tab set
 * reinventing the pattern (Frontend_Development_Rules.txt rule 4).
 *
 * The order is the order a contributor actually reads a project in: what
 * it is, then what the maintainers say about it, then what there is to do
 * here, then the raw issue list underneath all of it. Tasks and All
 * Issues carry counts on the tab itself because "is there anything for me
 * here?" is the question that decides whether the tab gets opened at all
 * — and both counts come from the lists themselves, never a separate
 * number that could disagree with what opening the tab shows (rule 38).
 *
 * Project Info stays deliberately plain: it's a definition list of facts,
 * including the DevTunnel/GitHub contributor split kept as two labeled
 * rows rather than one combined figure (admin_workflow.txt section 5 —
 * "do not mix the two datasets").
 */
export function ProjectDetailTabs({ project }: { project: DevtunnelProjectDetail }) {
  const [activeId, setActiveId] = useState<TabId>("info");

  const tabCount: Partial<Record<TabId, number>> = {
    tasks: project.tasks.length,
    issues: project.issues.length,
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label="Project details"
        className="mb-4 flex gap-4 overflow-x-auto overflow-y-hidden border-b border-border-subtle"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeId;
          const Icon = tab.icon;
          const count = tabCount[tab.id];

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`project-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`project-panel-${tab.id}`}
              onClick={() => setActiveId(tab.id)}
              className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[1.5px] pb-[9px] text-[12.5px] transition-colors ${
                isActive
                  ? "border-text text-text"
                  : "border-transparent text-text-dim hover:text-text-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {typeof count === "number" && count > 0 ? (
                <span className="rounded-full bg-surface-raised px-1.5 py-[1px] text-[10px] text-text-faint">
                  {count.toLocaleString()}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeId === "info" ? (
        <div
          role="tabpanel"
          id="project-panel-info"
          aria-labelledby="project-tab-info"
          className="rounded-[10px] border border-border bg-surface p-5"
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-[180px_1fr]">
            <span className="text-text-faint">Description</span>
            <span className="text-text-secondary">
              {project.description ?? "No description provided."}
            </span>

            <span className="text-text-faint">Repository</span>
            <a
              href={project.repositoryUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-text-secondary hover:text-accent"
            >
              {project.repositoryFullName}
            </a>

            <span className="text-text-faint">Maintainer</span>
            <a
              href={project.author.profileUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-text-secondary hover:text-accent"
            >
              {project.author.name ?? project.author.username} (@{project.author.username})
            </a>

            <span className="text-text-faint">Primary technology</span>
            <span className="text-text-secondary">{project.primaryTech ?? "—"}</span>

            <span className="text-text-faint">License</span>
            <span className="text-text-secondary">{project.license ?? "Not specified"}</span>

            <span className="text-text-faint">DevTunnel contributors</span>
            <span className="text-text-secondary">
              {project.devTunnelContributorCount.toLocaleString()}
            </span>

            <span className="text-text-faint">GitHub contributors</span>
            <span className="text-text-secondary">
              {project.githubContributorCount.toLocaleString()}
            </span>

            <span className="text-text-faint">DevTunnel tasks</span>
            <span className="text-text-secondary">{project.taskCount.toLocaleString()}</span>

            <span className="text-text-faint">Open issues on GitHub</span>
            <span className="text-text-secondary">
              {project.openIssuesCount.toLocaleString()}
            </span>
          </div>

          {project.techStack.length > 0 ? (
            <div className="mt-4 border-t border-border-subtle pt-4">
              <h3 className="m-0 mb-2 text-[11px] uppercase tracking-wide text-text-faint">
                Tech stack
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {project.techStack.map((tag) => (
                  <span
                    key={tag}
                    className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10.5px] ${getTechTagClasses(tag)}`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeId === "readme" ? (
        <div
          role="tabpanel"
          id="project-panel-readme"
          aria-labelledby="project-tab-readme"
          className="rounded-[10px] border border-border bg-surface p-5"
        >
          {project.readme ? (
            <MarkdownReadme content={project.readme} sourceUrl={project.repositoryUrl} />
          ) : (
            <GithubEmptyState
              compact
              variant="readme"
              title="No README yet"
              description="This repository doesn't have a README file. The source is still browsable directly on GitHub."
              primaryAction={{
                label: "View source on GitHub",
                href: project.repositoryUrl,
                external: true,
              }}
            />
          )}
        </div>
      ) : null}

      {activeId === "tasks" ? (
        <div
          role="tabpanel"
          id="project-panel-tasks"
          aria-labelledby="project-tab-tasks"
          className="rounded-[10px] border border-border bg-surface p-4"
        >
          <ProjectTasksPanel
            projectSlug={project.slug}
            tasks={project.tasks}
            repositoryUrl={project.repositoryUrl}
          />
        </div>
      ) : null}

      {activeId === "issues" ? (
        <div
          role="tabpanel"
          id="project-panel-issues"
          aria-labelledby="project-tab-issues"
          className="rounded-[10px] border border-border bg-surface p-4"
        >
          <ProjectIssuesPanel issues={project.issues} repositoryUrl={project.repositoryUrl} />
        </div>
      ) : null}
    </div>
  );
}
