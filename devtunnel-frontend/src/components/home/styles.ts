/**
 * Shared class strings for the redesigned Home page
 * (devtunnel_user_home_redesign.html).
 *
 * The redesign uses a handful of surface/border shades that sit between the
 * app's existing tokens (`surface` #111 vs the design's #0E0E0E panel,
 * `border` #232323 vs #1F1F1F). Rather than re-tuning tokens every other page
 * already depends on, the Home-only values live here as literal class strings
 * — defined once, so a panel, a list and a skeleton can't drift apart
 * (Frontend_Development_Rules.txt rule 51). Tailwind's content glob includes
 * every `.ts` file under `src/`, so these are picked up like any other class.
 *
 * Where a design color matches an existing token exactly, components use the
 * token instead (`text-text-muted` #8A8A8A, `text-text-dim` #6B6B6B,
 * `bg-accent` #1D9E75, `text-status-success-label` #5DCAA5, `bg-surface`
 * #111 for row hover).
 */

/** A bordered panel: journey card, stat strip, project card, list container. */
export const HOME_PANEL = "rounded-[10px] border border-[#1F1F1F] bg-[#0E0E0E]";

/** A panel that holds a stack of link rows separated by hairlines. */
export const HOME_LIST = `${HOME_PANEL} overflow-hidden divide-y divide-[#1A1A1A]`;

/**
 * A whole-row link inside `HOME_LIST`.
 *
 * Stacks (title above trailing info) on phones, where a 340px column can't
 * fit a title and its trailing status side by side, and goes to the design's
 * single row from `sm` up. The focus outline is drawn *inside* the row
 * (`-2px` offset) because the list is `overflow-hidden` and would clip an
 * outward ring.
 *
 * `HOME_ROW_LAYOUT` is just the box (so the loading skeleton can reuse it
 * without hover/focus styling); `HOME_ROW` adds the interactive states.
 */
export const HOME_ROW_LAYOUT =
  "flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3";

export const HOME_ROW = `${HOME_ROW_LAYOUT} transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-offset-[-2px]`;

/**
 * The box of a "Recently active" row (padding leaves room for the timeline
 * on the left). Shared with the loading skeleton so the two can't drift.
 */
export const HOME_ACTIVITY_ROW_LAYOUT =
  "flex items-center justify-between gap-3 py-2.5 pl-11 pr-4";

/**
 * Recommended tasks + Your tasks, side by side: `auto-fit` with a 340px
 * minimum, two columns when there's room, one otherwise. The
 * `min(340px,100%)` keeps the single column from overflowing a phone
 * narrower than 340px.
 */
export const HOME_TASKS_GRID =
  "grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-x-5 gap-y-7";

/**
 * Recommended-project card grid — `auto-fit` at a 190px minimum, as in the
 * design, so three cards sit on one row at desktop widths and it collapses to
 * one column on a phone.
 */
export const HOME_PROJECT_GRID =
  "grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3";
