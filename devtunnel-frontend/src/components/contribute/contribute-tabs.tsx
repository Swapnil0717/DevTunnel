"use client";

import { useState } from "react";
import { ContributionWaysPanel } from "@/components/contribute/contribution-ways-panel";
import { ContributeTasksPanel } from "@/components/contribute/contribute-tasks-panel";
import { ContributeWorkflowPanel } from "@/components/contribute/contribute-workflow-panel";
import { ContributeCliPanel } from "@/components/contribute/contribute-cli-panel";
import { GridIcon, ChecklistIcon, GitBranchIcon, TerminalIcon } from "@/components/layout/nav-icons";
import { buildWorkflowSteps } from "@/lib/contribute/workflow-steps";
import type { ContributeTarget } from "@/lib/contribute/types";

const TABS = [
  { id: "ways", label: "Ways to contribute", icon: GridIcon },
  { id: "tasks", label: "DevTunnel tasks", icon: ChecklistIcon },
  { id: "workflow", label: "How to submit", icon: GitBranchIcon },
  { id: "cli", label: "Submit via DevTunnel CLI", icon: TerminalIcon },
] as const;

type TabId = (typeof TABS)[number]["id"];

/**
 * The Contribute page's tabbed body.
 *
 * Real tab semantics (`role="tablist"` / `role="tab"` / `role="tabpanel"`),
 * the same wiring `ProjectDetailTabs`, `ToolDetailTabs` and `ProfileTabs`
 * already use, so keyboard and screen-reader behaviour is identical to
 * every other tab set in the app (rule 4).
 *
 * Four tabs, in the order the question actually gets answered: what kind
 * of help this project takes, what specifically is available right now,
 * how to get a change in by hand once you've picked something, and — for
 * anyone who'd rather script that same flow — what the planned `dev` CLI
 * would do for them instead.
 *
 * "DevTunnel tasks" opens first when the project has tasks. Someone who
 * clicked "Contribute to this project" and landed here has already
 * decided; sending them to a menu of contribution *types* first would put
 * an explainer in front of the one list that has real, claimable work on
 * it. With no tasks curated, that tab has nothing to offer, so the
 * general options lead instead.
 *
 * The task count sits on the tab because "is there anything for me here?"
 * is what decides whether the tab gets opened, and it comes from the list
 * itself rather than a separate figure that could disagree with it
 * (rule 38).
 */
export function ContributeTabs({ target }: { target: ContributeTarget }) {
  const hasTasks = target.tasks.length > 0;
  const [activeId, setActiveId] = useState<TabId>(hasTasks ? "tasks" : "ways");

  const workflowSteps = buildWorkflowSteps({
    repositoryUrl: target.repositoryUrl,
    repositoryFullName: target.repositoryFullName,
    cloneUrl: target.cloneUrl,
  });

  return (
    <div>
      <div
        role="tablist"
        aria-label="Ways to contribute to this project"
        className="mb-4 flex gap-4 overflow-x-auto overflow-y-hidden border-b border-border-subtle"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeId;
          const Icon = tab.icon;
          const count = tab.id === "tasks" ? target.tasks.length : undefined;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`contribute-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`contribute-panel-${tab.id}`}
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

      {activeId === "ways" ? (
        <div
          role="tabpanel"
          id="contribute-panel-ways"
          aria-labelledby="contribute-tab-ways"
          className="rounded-[10px] border border-border bg-surface p-4"
        >
          <ContributionWaysPanel repositoryUrl={target.repositoryUrl} />
        </div>
      ) : null}

      {activeId === "tasks" ? (
        <div
          role="tabpanel"
          id="contribute-panel-tasks"
          aria-labelledby="contribute-tab-tasks"
          className="rounded-[10px] border border-border bg-surface p-4"
        >
          <ContributeTasksPanel
            targetKind={target.kind}
            projectSlug={target.slug}
            tasks={target.tasks}
            repositoryUrl={target.repositoryUrl}
          />
        </div>
      ) : null}

      {activeId === "workflow" ? (
        <div
          role="tabpanel"
          id="contribute-panel-workflow"
          aria-labelledby="contribute-tab-workflow"
          className="rounded-[10px] border border-border bg-surface p-4"
        >
          <ContributeWorkflowPanel
            steps={workflowSteps}
            repositoryUrl={target.repositoryUrl}
            contributingGuideUrl={
              target.repositoryUrl ? `${target.repositoryUrl}/blob/HEAD/CONTRIBUTING.md` : null
            }
          />
        </div>
      ) : null}

      {activeId === "cli" ? (
        <div
          role="tabpanel"
          id="contribute-panel-cli"
          aria-labelledby="contribute-tab-cli"
          className="rounded-[10px] border border-border bg-surface p-4"
        >
          <ContributeCliPanel />
        </div>
      ) : null}
    </div>
  );
}