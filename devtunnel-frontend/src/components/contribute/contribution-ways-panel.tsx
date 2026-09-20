"use client";

import { useMemo, useState } from "react";
import { CONTRIBUTE_ICONS } from "@/components/contribute/contribute-icons";
import {
  CONTRIBUTION_CATEGORIES,
  CONTRIBUTION_WAYS,
} from "@/lib/contribute/contribution-ways";
import type { ContributionCategoryId, ContributionWay } from "@/lib/contribute/types";

type CategoryFilter = "ALL" | ContributionCategoryId;

/**
 * "Ways to contribute" tab — every kind of contribution this project can
 * take, grouped, with a filter bar over the top.
 *
 * Filtering is client-side over the static catalog in
 * `lib/contribute/contribution-ways.ts`; there is no fetch behind this
 * tab at all. Same "one list, browser-side narrowing" shape
 * `ProjectTasksPanel` and `IssuesExplorer` already use, and the counts on
 * the filter chips are computed from the list itself so they can't
 * disagree with what selecting them shows (rule 38).
 *
 * The "No coding needed" toggle is the one filter that isn't a category:
 * non-code work is spread across three of the four groups (docs sits in
 * Non-code, but writing a good bug report sits in Process and mentoring
 * sits in Community), so someone who doesn't write code can't find their
 * options by picking a single group. It combines with the category
 * filter rather than replacing it.
 *
 * Cards link out to a real GitHub destination only where one exists for
 * that kind of work — open bugs, unlabelled issues, the PR queue. A way
 * with no honest destination (refactoring, translation) renders without a
 * link instead of pointing somewhere generic (rule 58). Every link is
 * suppressed entirely when the target has no repository behind it.
 */
export function ContributionWaysPanel({ repositoryUrl }: { repositoryUrl: string | null }) {
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("ALL");
  const [noCodeOnly, setNoCodeOnly] = useState(false);

  const counts = useMemo(() => {
    const pool = noCodeOnly ? CONTRIBUTION_WAYS.filter((way) => !way.needsCode) : CONTRIBUTION_WAYS;
    const byCategory: Record<string, number> = { ALL: pool.length };
    for (const way of pool) {
      byCategory[way.category] = (byCategory[way.category] ?? 0) + 1;
    }
    return byCategory;
  }, [noCodeOnly]);

  const visibleWays = useMemo(
    () =>
      CONTRIBUTION_WAYS.filter((way) => {
        if (noCodeOnly && way.needsCode) return false;
        if (categoryFilter !== "ALL" && way.category !== categoryFilter) return false;
        return true;
      }),
    [categoryFilter, noCodeOnly],
  );

  const visibleCategories = CONTRIBUTION_CATEGORIES.filter((category) =>
    visibleWays.some((way) => way.category === category.id),
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setCategoryFilter("ALL")}
          aria-pressed={categoryFilter === "ALL"}
          className={chipClasses(categoryFilter === "ALL")}
        >
          Everything
          <span className="text-[11px] text-text-faint">{counts.ALL ?? 0}</span>
        </button>

        {CONTRIBUTION_CATEGORIES.map((category) => {
          const isActive = category.id === categoryFilter;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => setCategoryFilter(category.id)}
              aria-pressed={isActive}
              className={chipClasses(isActive)}
            >
              {category.label}
              <span className="text-[11px] text-text-faint">{counts[category.id] ?? 0}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setNoCodeOnly((value) => !value)}
          aria-pressed={noCodeOnly}
          className={`ml-auto inline-flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1 text-[12px] transition-colors ${
            noCodeOnly
              ? "border-accent/40 bg-surface-selected text-status-success-label"
              : "border-border-subtle bg-transparent text-text-dim hover:text-text-muted"
          }`}
        >
          No coding needed
        </button>
      </div>

      {visibleWays.length === 0 ? (
        <p className="m-0 rounded-[8px] border border-dashed border-border-subtle px-4 py-6 text-center text-[12.5px] text-text-muted">
          Nothing in this group is possible without code. Turn off the filter, or pick another
          group.
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {visibleCategories.map((category) => {
            const CategoryIcon = CONTRIBUTE_ICONS[category.iconId];
            const waysInCategory = visibleWays.filter((way) => way.category === category.id);

            return (
              <section key={category.id}>
                <div className="mb-2.5 flex items-start gap-2">
                  <CategoryIcon className="mt-[3px] h-3.5 w-3.5 shrink-0 text-text-faint" />
                  <div>
                    <h3 className="m-0 text-[13px] font-medium text-text">{category.label}</h3>
                    <p className="m-0 mt-0.5 text-[12px] text-text-muted">{category.summary}</p>
                  </div>
                </div>

                <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
                  {waysInCategory.map((way) => (
                    <WayCard key={way.id} way={way} repositoryUrl={repositoryUrl} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function chipClasses(isActive: boolean) {
  return `inline-flex items-center gap-1.5 rounded-[7px] border px-2.5 py-1 text-[12px] transition-colors ${
    isActive
      ? "border-border bg-surface-raised text-text"
      : "border-border-subtle bg-transparent text-text-dim hover:text-text-muted"
  }`;
}

/**
 * One way to contribute. Effort and "no code needed" are words on the
 * card, not a colored dot or a bare icon — the same rule the task rows
 * follow (rule 43).
 */
function WayCard({ way, repositoryUrl }: { way: ContributionWay; repositoryUrl: string | null }) {
  const Icon = CONTRIBUTE_ICONS[way.iconId];
  const href = repositoryUrl && way.repoPath ? `${repositoryUrl}${way.repoPath}` : null;

  return (
    <li className="flex flex-col rounded-[9px] border border-border-subtle bg-surface-raised p-3.5 transition-colors hover:border-border">
      <div className="flex items-start gap-2">
        <Icon className="mt-[2px] h-3.5 w-3.5 shrink-0 text-text-faint" />
        <h4 className="m-0 flex-1 text-[13px] font-medium text-text">{way.label}</h4>
      </div>

      <p className="m-0 mt-1.5 text-[12px] leading-relaxed text-text-secondary">
        {way.description}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-text-faint">
        <span>{way.effort} first step</span>
        {!way.needsCode ? (
          <>
            <span aria-hidden="true">·</span>
            <span>No code required</span>
          </>
        ) : null}

        {href && way.linkLabel ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="ml-auto font-medium text-text-muted hover:text-accent"
          >
            {way.linkLabel}
          </a>
        ) : null}
      </div>
    </li>
  );
}
