"use client";

import { useState } from "react";
import { MarkdownReadme } from "@/components/ui/markdown-readme";
import { GithubEmptyState } from "@/components/github-projects/github-empty-state";
import { ToolIssuesPanel } from "@/components/opensource-tools/tool-issues-panel";
import { GridIcon, FileIcon, ToolIcon, IssueIcon } from "@/components/layout/nav-icons";
import { formatRelativeTime } from "@/lib/home/format-relative-time";
import { getTechTagClasses } from "@/lib/home/tag-style";
import type { OpenSourceToolDetail } from "@/lib/opensource-tools/types";

const TABS = [
  { id: "info", label: "Tool Info", icon: GridIcon },
  { id: "setup", label: "Setup Guide", icon: ToolIcon },
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
 * - **Setup Guide replaces Tasks.** A tool has no DevTunnel tasks —
 *   `devtunnel.tasks` hangs off a project, not a tool (sql/017) — so a
 *   Tasks tab here could only ever be empty. What a tool *does* have,
 *   and what nothing else in this app has, is the Admin-authored setup
 *   guide from Step 4 of tool onboarding: the "how do I actually run
 *   this?" answer a contributor opens a tool page for in the first
 *   place. It sits second, ahead of the README, because it's the
 *   DevTunnel-specific thing; the README is the upstream project's own
 *   pitch and is one click further along.
 * - **All Issues depends on the repository.** A tool's source can be a
 *   docs site rather than a repo, so the count is absent (not zero) and
 *   the panel says so plainly instead of showing an empty list.
 */
export function ToolDetailTabs({ tool }: { tool: OpenSourceToolDetail }) {
  const [activeId, setActiveId] = useState<TabId>("info");

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
          const count = tab.id === "issues" ? tool.openIssues.length : undefined;

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
          <ToolIssuesPanel
            issues={tool.openIssues}
            repositoryUrl={tool.repository?.url ?? null}
          />
        </div>
      ) : null}
    </div>
  );
}
