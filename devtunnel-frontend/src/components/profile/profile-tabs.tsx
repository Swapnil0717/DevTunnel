"use client";

import { useState } from "react";

const TABS = [
  {
    id: "contributions",
    label: "Contribution history",
    empty:
      "No contribution activity yet. Recent activity will show up here once you start contributing.",
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
 * semantic HTML/ARIA over generic divs). The mockup's colored activity
 * heatmap under this tab isn't reproduced here: it's sample data with no
 * backing endpoint (same reasoning as ProfileStats), so it would have
 * meant fabricating a contribution history for whoever is signed in.
 * Each panel instead shows a truthful empty state until that data
 * exists.
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
        className="rounded-lg border border-border-subtle bg-surface px-4 py-8 text-center text-[12.5px] text-text-dim"
      >
        {active.empty}
      </div>
    </div>
  );
}