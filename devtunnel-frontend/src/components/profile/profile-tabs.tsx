"use client";

import { useState } from "react";
import { ContributionCalendar } from "./contribution-calendar";

const TABS = [
  {
    id: "contributions",
    label: "Contribution history",
  },
  {
    id: "projects",
    label: "Projects",
    empty: "You haven't joined any projects yet.",
  },
  {
    id: "pull-requests",
    label: "Pull requests",
    empty: "No pull requests yet.",
  },
] as const;

/**
 * Real, accessible tab UI (Frontend_Development_Rules.txt rule 4 —
 * semantic HTML/ARIA over generic divs).
 *
 * "Contribution history" now renders two real contribution calendars
 * side by side — GitHub's (`ContributionCalendar source="github"`,
 * backed by `GET /users/me/contributions`) and DevTunnel's own
 * (`source="devtunnel"`, backed by `GET /users/me/contributions/devtunnel`
 * — devtunnel-backend src/routes/devtunnelStats.ts) — so a contributor
 * can see their GitHub activity next to what they've specifically done
 * through DevTunnel (tasks completed, PRs merged here).
 *
 * "Projects" and "Pull requests" still render an honest empty state for
 * now — the profile page's stat cards (ProfileStats) already surface the
 * real counts for these from `GET /users/me/devtunnel-stats`; a
 * browsable per-tab list of the actual projects/PRs is a further step
 * once devtunnel-backend exposes list (not just count) endpoints for
 * them, so this tab doesn't invent a list here
 * (Frontend_Development_Rules.txt rule 58).
 */
export function ProfileTabs() {
  const [activeId, setActiveId] = useState<(typeof TABS)[number]["id"]>(
    TABS[0].id,
  );
  const active = TABS.find((tab) => tab.id === activeId) ?? TABS[0];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Profile activity"
        className="mb-3.5 flex gap-4 overflow-x-auto overflow-y-hidden border-b border-border-subtle"
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeId;
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
        ) : (
          <div className="rounded-lg border border-border-subtle bg-surface px-4 py-8 text-center text-[12.5px] text-text-dim">
            {active.empty}
          </div>
        )}
      </div>
    </div>
  );
}