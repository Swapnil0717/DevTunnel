"use client";

import { useState } from "react";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { ProjectTasksPanel } from "@/components/projects/project-tasks-panel";
import { ToolIssuesPanel } from "@/components/opensource-tools/tool-issues-panel";
import { GridIcon, FileIcon, ToolIcon, ChecklistIcon, IssueIcon } from "@/components/layout/nav-icons";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { getTechTagClasses } from "@/lib/home/tag-style";
import { repoIssuesPath } from "@/lib/issues/repo-issues-client";
import { useLoadAllIssues } from "@/lib/issues/use-load-all-issues";
import type { OpenSourceToolDetail, OpenSourceToolIssuePreview } from "@/lib/opensource-tools/types";

const TABS = [
  { id: "info", label: "Tool Info", icon: GridIcon },
  { id: "setup", label: "Setup Guide", icon: ToolIcon },
  { id: "tasks", label: "Tasks", icon: ChecklistIcon },
  { id: "readme", label: "README", icon: FileIcon },
  { id: "issues", label: "All Issues", icon: IssueIcon },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * Tool Detail page's tabbed body, the counterpart to
 * `ProjectDetailTabs` — same `role="tablist"`/`role="tab"`/
 * `role="tabpanel"` wiring `ProfileTabs` and `GithubProjectDetailTabs`
 * already establish (Frontend_Development_Rules.txt rule 4).
 *
 * Two deliberate differences from the project page's four tabs:
 *
 * - **Setup Guide, ahead of Tasks and README.** The Admin-authored setup
 *   guide from Step 4 of tool onboarding — the "how do I actually run
 *   this?" answer a contributor opens a tool page for in the first
 *   place — is the one thing this catalog has that no other page does,
 *   so it sits right after Tool Info, ahead of both Tasks and README.
 * - **Tasks reads the tool's linked shadow project.** Every tool
 *   onboarded since sql/034 gets a real `devtunnel.projects` row created
 *   for it automatically (`devtunnel.tasks` still hangs off a project,
 *   never a tool directly — a polymorphic owner column would lose real
 *   referential integrity, per sql/026's own header). `tool.tasks` is
 *   that linked project's tasks, and `ProjectTasksPanel` — the exact
 *   component the View Project page's own Tasks tab uses — is reused
 *   here unmodified (rule 51), pointed at `tool.linkedProjectSlug` so
 *   every row's "View task" link lands on the real
 *   `/projects/:projectSlug/tasks/:taskId` page. A tool onboarded before
 *   sql/034 has `linkedProjectSlug: null` and no tasks yet — the panel
 *   below falls back to the same "not linked yet" empty state a tool
 *   with a linked-but-genuinely-empty task list would never show.
 * - **All Issues depends on the repository.** A tool's source can be a
 *   docs site rather than a repo, so the count is absent (not zero) and
 *   the panel says so plainly instead of showing an empty list.
 *
 * The All Issues list's state (`useLoadAllIssues`) is held here rather
 * than in `ToolIssuesPanel`: the panel unmounts whenever another tab is
 * opened, and a contributor who just waited for the complete issue list
 * shouldn't have it thrown away by a glance at the setup guide. Holding it
 * here also lets the tab's badge follow what was actually loaded. With no
 * repository there's nothing to load from, so its `path` is `null`.
 */
export function ToolDetailTabs({ tool }: { tool: OpenSourceToolDetail }) {
  const [activeId, setActiveId] = useState<TabId>("info");

  const issuesLoader = useLoadAllIssues<OpenSourceToolIssuePreview>({
    path: tool.repository ? repoIssuesPath("/opensource-tools", tool.slug) : null,
    initialIssues: tool.openIssues,
    openIssuesCount: tool.repository?.openIssuesCount ?? 0,
  });

  // The badge comes from the list itself (rule 38), gaining a "+" when the
  // backend capped the full list.
  const issuesBadge =
    issuesLoader.issues.length > 0
      ? `${issuesLoader.issues.length.toLocaleString()}${
          issuesLoader.status === "loaded" && issuesLoader.truncated ? "+" : ""
        }`
      : undefined;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Tool details"
        className="mb-4 flex gap-4 overflow-x-auto overflow-y-hidden border-b border-border-subtle"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeId;
          const Icon = tab.icon;
          const badge =
            tab.id === "issues"
              ? issuesBadge
              : tab.id === "tasks" && tool.tasks.length > 0
                ? tool.tasks.length.toLocaleString()
                : undefined;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tool-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`tool-panel-${tab.id}`}
              onClick={() => setActiveId(tab.id)}
              className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[1.5px] pb-[9px] text-[12.5px] transition-colors ${
                isActive
                  ? "border-text text-text"
                  : "border-transparent text-text-dim hover:text-text-muted"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {badge ? (
                <span className="rounded-full bg-surface-raised px-1.5 py-[1px] text-[10px] text-text-faint">
                  {badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {activeId === "info" ? (
        <div
          role="tabpanel"
          id="tool-panel-info"
          aria-labelledby="tool-tab-info"
          className="rounded-[10px] border border-border bg-surface p-5"
        >
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-[180px_1fr]">
            <span className="text-text-faint">Description</span>
            <span className="text-text-secondary">
              {tool.description ?? "No description provided."}
            </span>

            <span className="text-text-faint">Source</span>
            <a
              href={tool.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="break-all font-mono text-text-secondary hover:text-accent"
            >
              {tool.sourceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
            </a>

            <span className="text-text-faint">Primary language</span>
            <span className="text-text-secondary">{tool.primaryLanguage ?? "—"}</span>

            {tool.repository ? (
              <>
                <span className="text-text-faint">Maintainer</span>
                <a
                  href={tool.repository.owner.profileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-text-secondary hover:text-accent"
                >
                  {tool.repository.owner.name ?? tool.repository.owner.username} (@
                  {tool.repository.owner.username})
                </a>

                <span className="text-text-faint">License</span>
                <span className="text-text-secondary">
                  {tool.repository.license ?? "Not specified"}
                </span>

                <span className="text-text-faint">Contributors</span>
                <span className="text-text-secondary">
                  {tool.repository.contributorCount.toLocaleString()}
                </span>
              </>
            ) : null}

            <span className="text-text-faint">Added to DevTunnel</span>
            <span className="text-text-secondary">
              <time dateTime={tool.createdAt}>{formatRelativeTime(tool.createdAt)}</time>
            </span>
          </div>

          {tool.labels.length > 0 ? (
            <div className="mt-4 border-t border-border-subtle pt-4">
              <h3 className="m-0 mb-2 text-[11px] uppercase tracking-wide text-text-faint">
                What it&apos;s useful for
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {tool.labels.map((label) => (
                  <span
                    key={label}
                    className={`inline-block rounded-[5px] border px-[7px] py-[2px] text-[10.5px] ${getTechTagClasses(label)}`}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeId === "setup" ? (
        <div
          role="tabpanel"
          id="tool-panel-setup"
          aria-labelledby="tool-tab-setup"
          className="rounded-[10px] border border-border bg-surface p-5"
        >
          <MarkdownReadme content={tool.setupGuide} sourceUrl={tool.repository?.url} />
        </div>
      ) : null}

      {activeId === "tasks" ? (
        <div
          role="tabpanel"
          id="tool-panel-tasks"
          aria-labelledby="tool-tab-tasks"
          className="rounded-[10px] border border-border bg-surface p-4"
        >
          {tool.linkedProjectSlug ? (
            <ProjectTasksPanel
              projectSlug={tool.linkedProjectSlug}
              tasks={tool.tasks}
              repositoryUrl={tool.repository?.url ?? tool.sourceUrl}
            />
          ) : (
            <GithubEmptyState
              compact
              variant="tasks-locked"
              title="No DevTunnel tasks yet"
              description="This tool isn't linked to a DevTunnel project yet, so it has no DevTunnel tasks of its own. Its open issues are still a great place to start in the meantime."
              primaryAction={
                tool.repository
                  ? { label: "Browse open issues", href: `${tool.repository.url}/issues`, external: true }
                  : { label: "Visit the tool", href: tool.sourceUrl, external: true }
              }
            />
          )}
        </div>
      ) : null}

      {activeId === "readme" ? (
        <div
          role="tabpanel"
          id="tool-panel-readme"
          aria-labelledby="tool-tab-readme"
          className="rounded-[10px] border border-border bg-surface p-5"
        >
          {tool.readme ? (
            <MarkdownReadme content={tool.readme} sourceUrl={tool.repository?.url} />
          ) : (
            <GithubEmptyState
              compact
              variant="readme"
              title="No README to show"
              description="DevTunnel has no README imported for this tool. The setup guide next door covers how to get it running."
              primaryAction={{ label: "Visit the tool", href: tool.sourceUrl, external: true }}
            />
          )}
        </div>
      ) : null}

      {activeId === "issues" ? (
        <div
          role="tabpanel"
          id="tool-panel-issues"
          aria-labelledby="tool-tab-issues"
          className="rounded-[10px] border border-border bg-surface p-4"
        >
          <ToolIssuesPanel loader={issuesLoader} repositoryUrl={tool.repository?.url ?? null} />
        </div>
      ) : null}
    </div>
  );
}
