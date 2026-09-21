"use client";

import { useState, type ReactNode } from "react";
import { ContributionCalendar } from "./contribution-calendar";

const TABS = [
  {
    id: "contributions",
    label: "Contribution history",
  },
  {
    id: "projects",
    label: "Projects",
  },
  {
    id: "tasks",
    label: "Tasks",
  },
  {
    id: "pull-requests",
    label: "Pull requests merged",
    empty: "No merged pull requests yet.",
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface ProfileTabsProps {
  /** The Projects tab's content — rendered on the server (`ProfileProjectsList`) and passed through. */
  projectsPanel: ReactNode;
  /** The Tasks tab's content (`ProfileTasksList`). */
  tasksPanel: ReactNode;
  /** How many projects the viewer has joined or is contributing to. `null` when that couldn't be loaded. */
  projectCount: number | null;
  /** How many tasks the viewer has viewed, started, submitted or finished. `null` when that couldn't be loaded. */
  taskCount: number | null;
}

/**
 * Real, accessible tab UI (Frontend_Development_Rules.txt rule 4 —
 * semantic HTML/ARIA over generic divs).
 *
 * "Contribution history" renders two real contribution calendars
 * side by side — GitHub's (`ContributionCalendar source="github"`,
 * backed by `GET /users/me/contributions`) and DevTunnel's own
 * (`source="devtunnel"`, backed by `GET /users/me/contributions/devtunnel`
 * — devtunnel-backend src/routes/devtunnelStats.ts) — so a contributor
 * can see their GitHub activity next to what they've specifically done
 * through DevTunnel (tasks completed, PRs merged here).
 *
 * **"Projects" and "Tasks" now show real lists** (from
 * `GET /users/me/profile-activity`): the projects the contributor has joined
 * or is contributing to, and the tasks they've viewed, started, submitted for
 * review or finished. Their content is built by the profile page (a Server
 * Component, so both lists arrive on first paint) and passed in as
 * `projectsPanel` / `tasksPanel` — this component only owns which tab is
 * showing. The tab labels carry the counts, so the numbers are visible before
 * a tab is opened; a count is left off, not shown as 0, when the request
 * behind it failed.
 *
 * "Pull requests merged" still renders an honest empty state — the profile
 * page's stat card (ProfileStats) already surfaces the real count from
 * `GET /users/me/devtunnel-stats`, and a browsable list of merged PRs is a
 * further step, so this tab doesn't invent one here
 * (Frontend_Development_Rules.txt rule 58). Pull requests the contributor
 * has *submitted* (opened, not merged) appear on the Tasks tab, against the
 * task they were opened for.
 */
export function ProfileTabs({
  projectsPanel,
  tasksPanel,
  projectCount,
  taskCount,
}: ProfileTabsProps) {
  const [activeId, setActiveId] = useState<TabId>(TABS[0].id);
  const active = TABS.find((tab) => tab.id === activeId) ?? TABS[0];

  const countFor = (id: TabId): number | null =>
    id === "projects" ? projectCount : id === "tasks" ? taskCount : null;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Profile activity"
        className="mb-3.5 flex gap-4 overflow-x-auto overflow-y-hidden border-b border-border-subtle"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeId;
          const count = countFor(tab.id);
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`profile-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`profile-panel-${tab.id}`}
              onClick={() => setActiveId(tab.id)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-[1.5px] pb-[9px] text-[12.5px] transition-colors ${
                isActive
                  ? "border-text text-text"
                  : "border-transparent text-text-dim hover:text-text-muted"
              }`}
            >
              {tab.label}
              {count !== null ? <span className="ml-1.5 text-text-faint">{count}</span> : null}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`profile-panel-${active.id}`}
        aria-labelledby={`profile-tab-${active.id}`}
      >
        {active.id === "contributions" ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-dim">
                GitHub
              </h3>
              <ContributionCalendar source="github" />
            </div>

            <div>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-dim">
                Through DevTunnel
              </h3>
              <ContributionCalendar source="devtunnel" />
            </div>
          </div>
        ) : active.id === "projects" ? (
          projectsPanel
        ) : active.id === "tasks" ? (
          tasksPanel
        ) : (
          <div className="rounded-lg border border-border-subtle bg-surface px-4 py-8 text-center text-[12.5px] text-text-dim">
            {active.empty}
          </div>
        )}
      </div>
    </div>
  );
}
