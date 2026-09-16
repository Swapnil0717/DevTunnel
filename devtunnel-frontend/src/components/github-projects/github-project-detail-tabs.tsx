"use client";

import { useState } from "react";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { GridIcon, FileIcon, IssueIcon } from "@/components/layout/nav-icons";
import { getTechTagClasses } from "@/lib/home/tag-style";
import type { GithubProjectDetail } from "@/lib/github-projects/types";

const TABS = [
  { id: "info", label: "Project Info", icon: GridIcon },
  { id: "readme", label: "README", icon: FileIcon },
  { id: "issues", label: "Issues", icon: IssueIcon },
] as const;

/**
 * Project Detail page's three-tab body — real, accessible tab UI
 * (Frontend_Development_Rules.txt rule 4 — semantic HTML/ARIA over
 * generic divs), same `role="tablist"`/`role="tab"`/`role="tabpanel"`
 * wiring `ProfileTabs` (`components/profile/profile-tabs.tsx`) already
 * establishes, so keyboard and screen-reader behavior stays consistent
 * across the app rather than each tab set reinventing its own pattern.
 *
 * - **Project Info** — the GitHub-sourced facts a contributor would
 *   otherwise have to piece together from the header and footer of the
 *   repo itself: license, primary language, full tech-stack list, and
 *   the raw star/fork/contributor counts side by side.
 * - **README** — the repository's own README, rendered exactly the way
 *   `MarkdownReadme` already renders it on the onboarding flow and the
 *   Admin Project Detail page, so a contributor never has to leave this
 *   page to read it. When GitHub reports no README, this now shows the
 *   illustrated `GithubEmptyState` ("readme" variant) with a real link
 *   out to the repository instead of one faint line of text.
 * - **Issues** — a page of the repository's currently-open issues
 *   (`GithubProjectIssuePreview[]`), each linking straight out to the
 *   real GitHub issue — this app has no issue tracker of its own for a
 *   repository DevTunnel hasn't onboarded yet, so "read more on GitHub"
 *   is the honest destination, same posture `IssuesTable` already takes
 *   for `/issues`. A repository with zero open issues now gets the
 *   "issues-clear" variant — framed as a good result (a checkmark, not
 *   a "nothing here" box), since an empty issue queue is something to
 *   feel good about.
 */
export function GithubProjectDetailTabs({ project }: { project: GithubProjectDetail }) {
  const [activeId, setActiveId] = useState<(typeof TABS)[number]["id"]>("info");

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
              {tab.id === "issues" ? (
                <span className="rounded-full bg-surface-raised px-1.5 py-[1px] text-[10px] text-text-faint">
                  {project.openIssuesCount.toLocaleString()}
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
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-[140px_1fr]">
            <span className="text-text-faint">Description</span>
            <span className="text-text-secondary">
              {project.description ?? "No description provided."}
            </span>

            <span className="text-text-faint">Primary language</span>
            <span className="text-text-secondary">{project.primaryLanguage ?? "—"}</span>

            <span className="text-text-faint">License</span>
            <span className="text-text-secondary">{project.license ?? "Not specified"}</span>

            <span className="text-text-faint">Contributors</span>
            <span className="text-text-secondary">
              {project.contributorCount.toLocaleString()}
            </span>

            <span className="text-text-faint">Stars</span>
            <span className="text-text-secondary">{project.stars.toLocaleString()}</span>

            <span className="text-text-faint">Forks</span>
            <span className="text-text-secondary">{project.forks.toLocaleString()}</span>
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

      {activeId === "issues" ? (
        <div
          role="tabpanel"
          id="project-panel-issues"
          aria-labelledby="project-tab-issues"
          className="rounded-[10px] border border-border bg-surface p-2"
        >
          {project.openIssues.length === 0 ? (
            <GithubEmptyState
              compact
              variant="issues-clear"
              title="All caught up"
              description="No open issues right now — this repository has nothing waiting on it."
              primaryAction={{
                label: "View issues on GitHub",
                href: `${project.repositoryUrl}/issues`,
                external: true,
              }}
            />
          ) : (
            <ul className="m-0 flex list-none flex-col divide-y divide-border-subtle p-0">
              {project.openIssues.map((issue) => (
                <li key={issue.id}>
                  <a
                    href={issue.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex flex-col gap-1 rounded-md px-3 py-2.5 hover:bg-surface-raised"
                  >
                    <span className="flex items-center gap-2 text-[13px] text-text">
                      <span className="font-mono text-text-muted">#{issue.number}</span>
                      {issue.title}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-faint">
                      <time dateTime={issue.createdAt}>
                        Opened {new Date(issue.createdAt).toLocaleDateString()}
                      </time>
                      {issue.commentCount > 0 ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {issue.commentCount.toLocaleString()} comment
                            {issue.commentCount === 1 ? "" : "s"}
                          </span>
                        </>
                      ) : null}
                      {issue.labels.map((label) => (
                        <span
                          key={label}
                          className="rounded-[5px] border border-border-subtle px-[6px] py-[1px] text-[10px] text-text-faint"
                        >
                          {label}
                        </span>
                      ))}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
