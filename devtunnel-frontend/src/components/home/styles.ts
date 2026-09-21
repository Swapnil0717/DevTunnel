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
 */
export const HOME_ROW =
  "flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-surface focus-visible:bg-surface focus-visible:outline-offset-[-2px] sm:flex-row sm:items-center sm:justify-between sm:gap-3";

/**
 * Recommended-project card grid — `auto-fit` at a 190px minimum, as in the
 * design, so three cards sit on one row at desktop widths and it collapses to
 * one column on a phone.
 */
export const HOME_PROJECT_GRID =
  "grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3";
