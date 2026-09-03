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
 * "Contribution history" now renders the real GitHub contribution
 * calendar (`ContributionCalendar`, backed by
 * `GET /users/me/contributions`) instead of a static empty state.
 * "Projects" and "Pull requests" still render an honest empty state —
 * those are DevTunnel-native concepts with no backing table yet (only
 * `users`/`sessions` exist in devtunnel-backend/sql), so there is nothing
 * truthful to show there until that module is built
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
        className="mb-3.5 flex gap-4 border-b border-border-subtle"
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
              className={`-mb-px border-b-[1.5px] pb-[9px] text-[12.5px] transition-colors ${
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
          <ContributionCalendar />
        ) : (
          <div className="rounded-lg border border-border-subtle bg-surface px-4 py-8 text-center text-[12.5px] text-text-dim">
            {active.empty}
          </div>
        )}
      </div>
    </div>
  );
}