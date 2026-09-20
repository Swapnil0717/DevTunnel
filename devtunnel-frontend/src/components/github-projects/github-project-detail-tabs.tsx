"use client";

import { useState } from "react";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { GithubIssuesPanel } from "@/components/github-projects/github-issues-panel";
import { GridIcon, FileIcon, IssueIcon } from "@/components/layout/nav-icons";
import { getTechTagClasses } from "@/lib/home/tag-style";
import { repoIssuesPath, type RepoIssuesBasePath } from "@/lib/issues/repo-issues-client";
import { useLoadAllIssues } from "@/lib/issues/use-load-all-issues";
import type { GithubProjectDetail, GithubProjectIssuePreview } from "@/lib/github-projects/types";

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
 * - **Issues** — the repository's currently-open issues
 *   (`GithubProjectIssuePreview[]`), each linking straight out to the
 *   real GitHub issue — this app has no issue tracker of its own for a
 *   repository DevTunnel hasn't onboarded yet, so "read more on GitHub"
 *   is the honest destination, same posture `IssuesTable` already takes
 *   for `/issues`. The page ships a first-page preview; "Load all
 *   issues" fetches the rest, and the list is paginated
 *   (`GithubIssuesPanel`). That list's state is held *here*, not in the
 *   panel, so it survives switching to another tab and back, and so the
 *   tab's count badge can reflect what was actually loaded.
 *
 * `issuesBasePath` says which backend catalog this repository came from
 * (`/github-projects` or `/github-open-source-tools`) — the two share
 * this component because their detail shape is identical, but each has
 * its own `.../:slug/issues` route for the full list. Same "which
 * catalog am I in" prop `GithubProjectCard` takes as `basePath`.
 */
export function GithubProjectDetailTabs({
  project,
  issuesBasePath,
}: {
  project: GithubProjectDetail;
  issuesBasePath: Extract<RepoIssuesBasePath, "/github-projects" | "/github-open-source-tools">;
}) {
  const [activeId, setActiveId] = useState<(typeof TABS)[number]["id"]>("info");

  const issuesLoader = useLoadAllIssues<GithubProjectIssuePreview>({
    path: repoIssuesPath(issuesBasePath, project.slug),
    initialIssues: project.openIssues,
    openIssuesCount: project.openIssuesCount,
  });

  // GitHub's own count until the full list has actually been loaded (it
  // also counts open pull requests, so it can overstate); after that, the
  // real length of the list on screen — with a "+" if the backend capped it.
  const issuesBadge =
    issuesLoader.status === "loaded"
      ? `${issuesLoader.issues.length.toLocaleString()}${issuesLoader.truncated ? "+" : ""}`
      : project.openIssuesCount.toLocaleString();

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
                  {issuesBadge}
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
          className="rounded-[10px] border border-border bg-surface p-4"
        >
          <GithubIssuesPanel loader={issuesLoader} repositoryUrl={project.repositoryUrl} />
        </div>
      ) : null}
    </div>
  );
}
