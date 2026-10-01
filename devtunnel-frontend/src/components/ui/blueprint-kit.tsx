// src/components/ui/blueprint-kit.tsx
/**
 * Blueprint-sheet counterparts of every helper in `skeleton.tsx`, so a
 * route's `loading.tsx` can swap the flat shimmer skeleton for the
 * blueprint "setting out" sheet (see `blueprint-loader.tsx`) by changing
 * imports and its outer wrapper rather than being rewritten.
 *
 * Every export mirrors the `skeleton.tsx` helper of the same name with
 * `Skeleton` → `Blueprint` (props unchanged); `BlueprintFill` is the
 * `SkeletonBlock` equivalent. Where a skeleton draws a `bg-surface`
 * card, this draws a faint accent-tinted panel with a hairline outline;
 * where it draws a shimmering bar, this draws a diagonally hatched
 * bar that is "drawn" in from its top edge (`.blueprint-fill`,
 * globals.css). Compose them inside `<BlueprintSheet>`, never directly
 * on the page background — they're drawn as light accent "ink" and
 * assume the sheet's deep green behind them. Inline, already-rendered UI (the Home
 * journey card, "load more" pagination) keeps using `skeleton.tsx`.
 */

import type { ReactNode } from "react";

/**
 * One hatched placeholder bar — the `SkeletonBlock` drop-in. Size and
 * shape come from `className` exactly as they do on `SkeletonBlock`
 * (`h-3 w-32`, `rounded-full`, …). A corner radius in `className` wins;
 * otherwise blocks get the sheet's square 2px corner.
 *
 * `delayMs` overrides the sibling-position stagger from globals.css, for
 * blocks that should build in sequence but aren't siblings.
 */
export function BlueprintFill({
  className = "",
  delayMs,
}: {
  className?: string;
  delayMs?: number;
}) {
  return (
    <div
      className={`blueprint-fill ${className.includes("rounded") ? "" : "rounded-[2px]"} ${className}`}
      style={
        delayMs === undefined
          ? undefined
          : { animationDelay: `calc(${delayMs}ms - var(--bp-elapsed, 0ms))` }
      }
      aria-hidden="true"
    />
  );
}

/**
 * Static lookup rather than a template-literal class name — Tailwind's
 * class scanner needs the full `sm:grid-cols-N` string to appear
 * literally somewhere, and a `count` that only exists at request time
 * can't satisfy that. Covers every count an `AdminStatCard` row actually
 * uses today (Task detail: 3, Admin Dashboard/most grids: 4, Project
 * detail: 5); anything else falls back to 4.
 */
const STAT_CARD_GRID_COLS: Record<number, string> = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
};

/**
 * A row of N stat-card placeholders, matching `AdminStatCard`'s shape.
 * `sm:grid-cols-{count}` so the placeholder wraps at the same count as
 * the real grid — previously hardcoded to 4 columns regardless of
 * `count`, so a 5-card row (Project detail) or 3-card row (Task detail)
 * wrapped its cards onto a different line than the real data did.
 */
export function BlueprintStatCards({ count = 4 }: { count?: number }) {
  const gridColsClass = STAT_CARD_GRID_COLS[count] ?? STAT_CARD_GRID_COLS[4];
  return (
    <div className={`grid grid-cols-2 gap-3 ${gridColsClass}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] px-4 py-3.5">
          <BlueprintFill className="mb-2 h-2.5 w-16" />
          <BlueprintFill className="h-5 w-10" />
        </div>
      ))}
    </div>
  );
}

/**
 * A page heading placeholder matching the `<h1> + <p>` title/subtitle
 * block every admin list/queue page renders inside its own
 * `mb-8 flex flex-wrap items-start justify-between gap-4` (or plain
 * `mb-8`, when there's no right-hand action) header `div` — not a
 * generic single title bar. `actions` lets a page pass its own real
 * button placeholders (Projects has two: "Sync all" + "Onboard a
 * project"; Tasks and Open Source Tools each have one; the AI queue and
 * Activity pages have none, since their controls render as their own
 * block below the header). Falls back to a single default-width button
 * when `withAction` is true and no `actions` are given.
 */
export function BlueprintPageHeader({
  withAction = true,
  actions,
}: {
  withAction?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4" aria-hidden="true">
      <div className="flex flex-col gap-1">
        <BlueprintFill className="h-7 w-52" />
        <BlueprintFill className="h-5 w-80" />
      </div>
      {actions ?? (withAction ? <BlueprintFill className="h-9 w-36" /> : null)}
    </div>
  );
}

/**
 * A small CAD dimension callout — a dotted leader running out to a
 * numbered tag — the same touch `BlueprintBlock` (blueprint-loader.tsx)
 * puts under its wide blocks. Used under tables, whose full width is
 * exactly the kind of span a drawing would dimension.
 */
function BlueprintDimension({ label }: { label: string }) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5" aria-hidden="true">
      <span className="blueprint-leader h-px flex-1 border-t border-dotted border-blueprint/50" />
      <span className="shrink-0 rounded-[2px] border border-blueprint/40 bg-blueprint/10 px-1 py-px text-[9px] leading-tight text-blueprint/80">
        {label}
      </span>
      <span className="blueprint-leader h-px flex-1 border-t border-dotted border-blueprint/50" />
    </div>
  );
}

/**
 * A bordered table-shaped placeholder: header bar + N row placeholders,
 * dimensioned along its bottom edge. `headings` are the real column
 * labels (`TasksTable`, `IssuesTable`, the admin tables all render a
 * fixed, known set) rendered as actual small-caps text rather than bars
 * — there's nothing to guess here, so there's no reason to hide it
 * behind a placeholder. `rounded-[10px]` and `py-3` match the real
 * tables' own corner radius and cell padding (`overflow-hidden
 * rounded-[10px] border border-border`); `twoLineColumns` gives that
 * many leading columns a second, shorter placeholder line stacked under
 * the first — the real first columns are almost always a title/name
 * line plus a muted meta line (e.g. `TasksTable`'s Task and Project
 * cells), so a single bar undershoots the real ~62px row height.
 */
export function BlueprintTable({
  headings,
  rows = 6,
  twoLineColumns = 2,
}: {
  headings: string[];
  rows?: number;
  twoLineColumns?: number;
}) {
  const columns = headings.length;
  return (
    <div aria-hidden="true">
      <div className="overflow-hidden rounded-[10px] border border-blueprint/25">
        <div className="flex gap-4 border-b border-blueprint/25 bg-blueprint/[0.05] px-4 py-3">
          {headings.map((heading) => (
            <span
              key={heading}
              className="flex-1 text-[11px] font-normal uppercase tracking-wide text-blueprint/60"
            >
              {heading}
            </span>
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="flex items-start gap-4 border-b border-blueprint/25 px-4 py-3.5 last:border-b-0"
          >
            {Array.from({ length: columns }).map((_, colIndex) =>
              colIndex < twoLineColumns ? (
                <div key={colIndex} className="flex flex-1 flex-col gap-1.5">
                  <BlueprintFill className="h-3 w-4/5" />
                  <BlueprintFill className="h-2.5 w-1/2" />
                </div>
              ) : (
                <BlueprintFill key={colIndex} className="mt-0.5 h-3 flex-1" />
              ),
            )}
          </div>
        ))}
      </div>
      <BlueprintDimension label={`${columns * 240}`} />
    </div>
  );
}

/** A handful of skeleton text lines, e.g. for a detail page's body copy. */
export function BlueprintLines({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <BlueprintFill key={index} className={`h-3 ${index === count - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/** Circular avatar + a couple of text-line placeholders, for profile-style headers. */
export function BlueprintAvatarHeader() {
  return (
    <div className="mb-5 flex items-center gap-4" aria-hidden="true">
      <BlueprintFill className="h-16 w-16 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <BlueprintFill className="h-4 w-40" />
        <BlueprintFill className="h-3 w-24" />
      </div>
    </div>
  );
}

/**
 * "Back to X" link + breadcrumb nav + title/meta row + action-button
 * row, matching the shared header on
 * `/admin/{projects,tasks,opensource-tools}/[id]` — none of which use a
 * circular avatar (that's profile-only), so this is the detail-page
 * counterpart to `BlueprintAvatarHeader`. Pass `withLogo` for the tool
 * detail page, the one variant with a square logo next to the title
 * (`OpenSourceToolLogo`, `rounded-[12px]`, not round).
 *
 * `meta` and `actions` let each `loading.tsx` pass placeholders shaped
 * like its own page's real content instead of one generic line/two
 * buttons — the three pages render a different number of meta chips
 * (2–3, some with icons, one with a status badge) and a different
 * number of action buttons (Project detail alone has five: View on
 * GitHub, Edit details, Sync GitHub data, Archive/Reactivate, Delete),
 * so a single fixed shape here could only ever be right for one of the
 * three pages. Falls back to the previous generic shape when omitted.
 */
export function BlueprintDetailHeader({
  withLogo = false,
  meta,
  actions,
}: {
  withLogo?: boolean;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div aria-hidden="true">
      <BlueprintFill className="mb-4 h-3 w-32" />
      <BlueprintFill className="mb-6 h-3 w-40" />
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className={withLogo ? "flex items-start gap-4" : "flex flex-col gap-2.5"}>
          {withLogo ? <BlueprintFill className="h-14 w-14 shrink-0 rounded-[12px]" /> : null}
          <div className="flex flex-col gap-2.5">
            <BlueprintFill className="h-5 w-52" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {meta ?? <BlueprintFill className="h-3 w-64" />}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions ?? (
            <>
              <BlueprintFill className="h-9 w-28" />
              <BlueprintFill className="h-9 w-24" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Search box + N labeled filter-select placeholders, matching the filter
 * bar every **admin** Explorer renders above its table/grid
 * (`AdminProjectsExplorer`, `AdminTasksExplorer`,
 * `AdminOpenSourceToolsExplorer`, `AdminActivityExplorer`) — search on
 * the left, filters right-aligned on the same row
 * (`sm:flex-row … sm:justify-between`). The **public** list pages
 * (`/projects`, `/opensource-tools`, `/github-projects`,
 * `/github-open-source-tools`, `/tasks`, `/issues`) use a different,
 * always-stacked layout instead — see `BlueprintPublicFilterBar` below,
 * not this one.
 */
export function BlueprintFilterBar({ filters = 2 }: { filters?: number }) {
  return (
    <div
      className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between"
      aria-hidden="true"
    >
      <BlueprintFill className="h-9 w-full sm:max-w-xs" />
      <div className="flex flex-wrap items-end gap-3">
        {Array.from({ length: filters }).map((_, index) => (
          <div key={index} className="flex flex-col gap-1">
            <BlueprintFill className="h-2 w-12" />
            <BlueprintFill className="h-9 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The "Ask AI to find projects/tools" panel (`AiSearchBar`,
 * `components/ai/ai-search-bar.tsx`) as it renders for a signed-in
 * contributor (and while auth is still resolving): a bordered
 * `rounded-[10px] p-3` section holding the small-caps "Ask AI to find …"
 * label, then the prompt input with its "Ask AI" button — side by side
 * from `sm`, stacked below it. Heights are the real ones at 1.5 line
 * height: label 16.5px, input 36.75px (`py-2` + 12.5px text + border),
 * button 34.75px stretched to the input's height on `sm`.
 */
export function BlueprintAiSearchBar() {
  return (
    <div className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-3" aria-hidden="true">
      <div className="flex flex-col gap-1.5">
        <div className="flex h-[16.5px] items-center">
          <BlueprintFill className="h-2 w-40" />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <BlueprintFill className="h-[36.75px] w-full" />
          <BlueprintFill className="h-[34.75px] w-full sm:h-[36.75px] sm:w-[84px] sm:shrink-0" />
        </div>
      </div>
    </div>
  );
}

/**
 * Search box + optional "Match my profile" row + optional AI search
 * panel + N labeled filter-select placeholders, matching the filter bar
 * every **public** list page renders above its grid/table
 * (`DevtunnelProjectsExplorer`, `DevtunnelOpenSourceToolsExplorer`,
 * `GithubProjectsExplorer` — reused for both `/github-projects` and
 * `/github-open-source-tools` — `TasksExplorer`, `IssuesExplorer`).
 * Unlike `BlueprintFilterBar` (admin), this is a single `flex-col` stack
 * at every breakpoint, in the real order: a `max-w-xs` search box, then
 * (for the pages that have it) a "Match my profile" button on its own
 * row, then (for the pages that have it) the "Ask AI" panel, then a
 * `flex-wrap items-end` row of label-over-select filters.
 * `bottomMarginClassName` covers the one real difference in the wrapper's
 * own spacing: the card-grid pages use `mb-4`, the two table pages
 * (`/tasks`, `/issues`) use `mb-3`.
 *
 * Every size is the real element's, at the app's 1.5 line height, so the
 * stack is exactly as tall as the real one and nothing shifts when the
 * page swaps in:
 *  - search input / `FilterSelect` trigger: `py-2` + 12.5px text +
 *    1px border = 36.75px; a trigger is at least `min-w-[150px]` wide;
 *  - field label: 11px uppercase text = 16.5px line, 4px above its select;
 *  - "Match my profile": `py-1.5` + 11.5px text + border = 31.25px.
 */
export function BlueprintPublicFilterBar({
  filters = 3,
  labels,
  withMatchProfile = false,
  withAiSearch = false,
  bottomMarginClassName = "mb-4",
}: {
  filters?: number;
  /** The real field labels, in order. When given they set the filter count and are ghosted at their real width. */
  labels?: string[];
  withMatchProfile?: boolean;
  /** `/projects` and `/opensource-tools` (and both GitHub catalogs) render the "Ask AI" panel. */
  withAiSearch?: boolean;
  bottomMarginClassName?: string;
}) {
  return (
    <div className={`${bottomMarginClassName} flex flex-col gap-3`} aria-hidden="true">
      <BlueprintFill className="h-[36.75px] w-full sm:max-w-xs" />
      {withMatchProfile ? <BlueprintFill className="h-[31.25px] w-[118px]" /> : null}
      {withAiSearch ? <BlueprintAiSearchBar /> : null}
      <div className="flex flex-wrap items-end gap-2">
        {Array.from({ length: labels ? labels.length : filters }).map((_, index) => (
          <div key={index} className="flex flex-col gap-1">
            {labels ? (
              <div className="text-[11px] font-normal uppercase tracking-wide">
                <BlueprintGhostText text={labels[index] ?? ""} />
              </div>
            ) : (
              <div className="flex h-[16.5px] items-center">
                <BlueprintFill className="h-2 w-12" />
              </div>
            )}
            <BlueprintFill className="h-[36.75px] w-[150px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The "Showing the top N … by stars / Load all" row (`LoadCatalogBar`,
 * `components/github-projects/load-catalog-bar.tsx`) that sits above the
 * grid on the two GitHub catalog pages (`/github-projects`,
 * `/github-open-source-tools`) — previously missing from both
 * `loading.tsx` files entirely, so the grid shifted up the moment that
 * row mounted with real data.
 */
export function BlueprintLoadCatalogBar() {
  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
      aria-hidden="true"
    >
      <BlueprintFill className="h-2.5 w-72" />
      <BlueprintFill className="h-7 w-28" />
    </div>
  );
}

/**
 * The numbered pagination footer (`PagePaginationControls`,
 * `components/admin/page-pagination-controls.tsx`) every paginated
 * list/table renders below its grid or table — a "Showing X–Y of Z…"
 * line on the left, Previous/numbered/Next controls on the right,
 * separated from the content above by the same `border-t pt-4` the real
 * component uses. Previously missing from every public list page's
 * skeleton, so the page grew taller the moment real data (and its
 * pagination footer) replaced the placeholder grid/table.
 */
export function BlueprintPagination({ pageNumbers = 4 }: { pageNumbers?: number }) {
  return (
    <div
      className="mt-4 flex flex-col gap-3 border-t border-blueprint/25 pt-4 sm:flex-row sm:items-center sm:justify-between"
      aria-hidden="true"
    >
      {/* "Showing X–Y of Z …" — an 11.5px text line (17.25px). */}
      <div className="flex h-[17.25px] items-center">
        <BlueprintFill className="h-2.5 w-52" />
      </div>
      {/* Previous / numbers / Next — `py-1.5` + 12px text + border = 32px. */}
      <div className="flex flex-wrap items-center gap-1">
        <BlueprintFill className="h-8 w-[72px]" />
        {Array.from({ length: pageNumbers }).map((_, index) => (
          <BlueprintFill key={index} className="h-8 w-[30px]" />
        ))}
        <BlueprintFill className="h-8 w-[52px]" />
      </div>
    </div>
  );
}

/**
 * Filter bar + N review-card placeholders, matching `AiDiscoveryQueue`'s
 * rendered list (title link, subtitle line, meta chips, Confirm/Reject
 * buttons) — replaces `BlueprintTable`, which this queue never actually
 * renders as (it's a card list, not a table).
 */
export function BlueprintQueueList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-blueprint/15 bg-blueprint/[0.03] p-3">
        <BlueprintFill className="h-9 w-full sm:w-64" />
        <BlueprintFill className="h-9 w-32" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-lg border border-blueprint/25 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <BlueprintFill className="h-3.5 w-2/5" />
              <BlueprintFill className="mt-2 h-3 w-3/5" />
              <BlueprintFill className="mt-2 h-2.5 w-1/3" />
            </div>
            <div className="flex shrink-0 gap-2">
              <BlueprintFill className="h-7 w-[74px]" />
              <BlueprintFill className="h-7 w-[64px]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * N tool-card placeholders matching `AdminOpenSourceToolCard`: a
 * centered 88px square logo, a name line, a two-line description, a tag
 * pill, then a bordered View/Edit/Delete action row — replaces a flat
 * `h-[120px]` rectangle that had none of that internal shape.
 */
export function BlueprintToolCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col items-center rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-4"
        >
          <BlueprintFill className="h-[88px] w-[88px] rounded-[12px]" />
          <BlueprintFill className="mt-2.5 h-3.5 w-24" />
          <BlueprintFill className="mt-1.5 h-2.5 w-32" />
          <BlueprintFill className="mt-1.5 h-2.5 w-14 rounded-full" />
          <div className="mt-3 flex w-full items-center justify-center gap-2 border-t border-blueprint/15 pt-2.5">
            <BlueprintFill className="h-5 w-10" />
            <BlueprintFill className="h-5 w-10" />
            <BlueprintFill className="h-5 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}
/**
 * N `GithubProjectCard`-shaped placeholders for `/github-projects`'s
 * card grid: a left-aligned repo-logo + name/`owner-repo` row, a
 * two-line description, a row of language/tag chips, then a bordered
 * stars/forks/issues + "updated" footer row — sized for
 * `GithubProjectCard` specifically (left-aligned repo row) rather than
 * `BlueprintToolCardGrid`'s centered-square-logo layout, same "match the
 * real card's own internal shape" approach as that helper.
 */
 export function BlueprintGithubProjectCardGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-4"
        >
          <div className="mb-2.5 flex items-start gap-2.5">
            <BlueprintFill className="h-8 w-8 shrink-0 rounded-full" />
            <div className="flex-1">
              <BlueprintFill className="h-3 w-28" />
              <BlueprintFill className="mt-1.5 h-2.5 w-20" />
            </div>
          </div>
          <BlueprintFill className="mb-1.5 h-2.5 w-full" />
          <BlueprintFill className="mb-3 h-2.5 w-3/5" />
          <div className="mb-3 flex gap-1.5">
            <BlueprintFill className="h-4 w-14 rounded-full" />
            <BlueprintFill className="h-4 w-12 rounded-full" />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-blueprint/15 pt-2.5">
            <BlueprintFill className="h-3 w-24" />
            <BlueprintFill className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
/**
 * N `DevtunnelProjectCard`-shaped placeholders for `/projects`'s card
 * grid, sized line for line to the real card (`p-4`, 1px border, 1.5
 * line height) so a row of placeholders is exactly as tall as a row of
 * real cards (≈183px) and the page doesn't jump when data lands:
 *
 *  - header: 32px logo beside a name line (13px `leading-tight` =
 *    16.25px) and a "Project on Devtunnel" line (11px = 16.5px) 2px
 *    under it → 34.75px, not the logo's 32px;
 *  - description: `line-clamp-2` at 11.5px `leading-snug` = two
 *    15.8125px lines (31.625px; the card's `min-h-[2.6em]` is 29.9px);
 *  - one tech tag: 10px text + `py-[2px]` + border = 21px;
 *  - footer: match badge (11px = 16.5px) + "View project" (10.5px =
 *    15.75px) under a `pt-2.5` hairline.
 */
export function BlueprintDevtunnelProjectCardGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-4"
        >
          <div className="mb-2.5 flex items-start gap-2.5">
            <BlueprintFill className="h-8 w-8 shrink-0 rounded-[10px]" />
            <div className="min-w-0 flex-1">
              <div className="flex h-[16.25px] items-center">
                <BlueprintFill className="h-3 w-28" />
              </div>
              <div className="mt-0.5 flex h-[16.5px] items-center">
                <BlueprintFill className="h-2.5 w-32" />
              </div>
            </div>
          </div>
          <div className="mb-3">
            <div className="flex h-[15.8125px] items-center">
              <BlueprintFill className="h-2.5 w-full" />
            </div>
            <div className="flex h-[15.8125px] items-center">
              <BlueprintFill className="h-2.5 w-3/5" />
            </div>
          </div>
          <div className="mb-3 flex items-center gap-1.5">
            <BlueprintFill className="h-[21px] w-[68px] rounded-[5px]" />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-blueprint/15 pt-2.5">
            <div className="flex h-[16.5px] items-center">
              <BlueprintFill className="h-3 w-28" />
            </div>
            <div className="flex h-[15.75px] items-center">
              <BlueprintFill className="h-2.5 w-[72px]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
/**
 * The shared two-panel layout every onboarding wizard renders —
 * `ProjectOnboardingWizard`, `TaskOnboardingWizard`,
 * `OpenSourceToolOnboardingWizard`, and `SubmissionOnboardingWizard`
 * all return the exact same shell (`<main class="flex min-h-screen
 * w-full flex-col bg-bg lg:flex-row">`): a fixed-width `<aside>` with a
 * "Back to X" link, the logo, a mobile horizontal step strip, a
 * desktop title/blurb + vertical numbered `StepIndicator` rail, and a
 * footnote line; then a flexed content column, centered and capped at
 * `max-w-[720px]`, holding the current step's own content plus its
 * Back/Continue button row. Previously each of the four `.../new`
 * pages either had no dedicated `loading.tsx` at all or (worse)
 * borrowed the list page's table/grid skeleton for this completely
 * different two-panel wizard shape. Like every other helper here, real
 * copy is never rendered as text (`BlueprintPageHeader` and
 * `BlueprintDetailHeader` don't either) — only `stepLabels`' *length*
 * (each wizard's real step count: 5 for Project/Task/Tool, 3 for
 * Submission) and `currentStep` shape the rail, so each route's
 * `loading.tsx` just passes its own `STEP_LABELS` array.
 */
export function BlueprintWizardLayout({
  stepLabels,
  currentStep = 1,
}: {
  stepLabels: string[];
  currentStep?: number;
}) {
  const totalSteps = stepLabels.length;
  return (
    <main className="flex min-h-screen w-full flex-col bg-bg lg:flex-row" aria-hidden="true">
      <aside className="flex flex-shrink-0 flex-col gap-6 border-b border-blueprint/25 px-4 py-5 sm:px-6 lg:w-[320px] lg:justify-between lg:gap-0 lg:border-b-0 lg:border-r lg:px-10 lg:py-12 xl:w-[380px]">
        <BlueprintFill className="h-3 w-28" />

        <div className="flex items-center justify-between lg:block">
          <BlueprintFill className="h-6 w-32 lg:hidden" />
          <div className="hidden items-center gap-1.5 lg:flex">
            <BlueprintFill className="h-5 w-5 rounded-[6px]" />
            <BlueprintFill className="h-3.5 w-20" />
          </div>
          <div className="flex items-center gap-2 lg:hidden">
            <span className="font-mono text-[11px] text-blueprint/50">1/{totalSteps}</span>
            <div className="flex gap-1">
              {Array.from({ length: totalSteps }).map((_, index) => (
                <BlueprintFill key={index} className="h-[3px] w-[22px] rounded-sm" />
              ))}
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
          <BlueprintFill className="mb-1 h-[19px] w-48" />
          <div className="mb-10 flex flex-col gap-1.5">
            <BlueprintFill className="h-2.5 w-[260px]" />
            <BlueprintFill className="h-2.5 w-[200px]" />
          </div>
          <ol className="m-0 flex list-none flex-col p-0">
            {stepLabels.map((label, index) => {
              const stepNumber = index + 1;
              const isCurrent = stepNumber === currentStep;
              return (
                <li key={label ?? stepNumber} className="flex gap-3 pb-7 last:pb-0">
                  <div className="flex flex-col items-center">
                    <span
                      className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-[11px] ${
                        isCurrent ? "border-blueprint/60" : "border-blueprint/25"
                      }`}
                    >
                      <BlueprintFill className="h-full w-full rounded-full" delayMs={index * 60} />
                    </span>
                    {stepNumber < totalSteps ? (
                      <span className="mt-1 w-px flex-1 bg-blueprint/25" />
                    ) : null}
                  </div>
                  <div className="pt-0.5">
                    <BlueprintFill className="h-3 w-24" delayMs={index * 60} />
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <BlueprintFill className="hidden h-2.5 w-full max-w-[260px] lg:block" />
      </aside>

      <div className="flex flex-1 items-center justify-center px-4 py-6 sm:px-6 sm:py-10 lg:px-16 lg:py-14 xl:px-20">
        <div className="flex w-full max-w-[720px] flex-col gap-6 sm:gap-8">
          <div className="flex flex-1 flex-col gap-4">
            <BlueprintFill className="h-5 w-56" />
            <BlueprintFill className="h-40 w-full rounded-[10px]" />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-blueprint/15 pt-6">
            <BlueprintFill className="h-9 w-20" />
            <BlueprintFill className="h-9 w-28" />
          </div>
        </div>
      </div>
    </main>
  );
}

/**
 * N `DevtunnelOpenSourceToolCard`-shaped placeholders for
 * `/opensource-tools`'s card grid, sized line for line to the real card
 * (≈183px tall, same as a project card) — kept as its own export so
 * this page's `loading.tsx` isn't coupled to a name that documents a
 * different route. Differences from the project card's real shape:
 *
 *  - the logo is `rounded-[12px]` (`OpenSourceToolLogo`), not 10px;
 *  - the second header line is the mono `github.com/owner/repo` source
 *    line (11px = 16.5px);
 *  - the tag row is a language tag plus label tags (21px each);
 *  - the footer is "Visit tool ↗" and "Added <time>", both 10.5px text
 *    (15.75px).
 */
export function BlueprintDevtunnelOpenSourceToolCardGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-4"
        >
          <div className="mb-2.5 flex items-start gap-2.5">
            <BlueprintFill className="h-8 w-8 shrink-0 rounded-[12px]" />
            <div className="min-w-0 flex-1">
              <div className="flex h-[16.25px] items-center">
                <BlueprintFill className="h-3 w-28" />
              </div>
              <div className="mt-0.5 flex h-[16.5px] items-center">
                <BlueprintFill className="h-2.5 w-36" />
              </div>
            </div>
          </div>
          <div className="mb-3">
            <div className="flex h-[15.8125px] items-center">
              <BlueprintFill className="h-2.5 w-full" />
            </div>
            <div className="flex h-[15.8125px] items-center">
              <BlueprintFill className="h-2.5 w-3/5" />
            </div>
          </div>
          <div className="mb-3 flex items-center gap-1.5">
            <BlueprintFill className="h-[21px] w-[68px] rounded-[5px]" />
            <BlueprintFill className="h-[21px] w-14 rounded-[5px]" />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-blueprint/15 pt-2.5">
            <div className="flex h-[15.75px] items-center">
              <BlueprintFill className="h-2.5 w-16" />
            </div>
            <div className="flex h-[15.75px] items-center">
              <BlueprintFill className="h-2.5 w-24" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Ghost-text primitives for the public detail / contribute pages.
 *
 * Every placeholder below reserves its space with real, invisible text
 * set in the same font size and line height as the element it stands in
 * for, and draws the hatched bar over that text. The line box therefore
 * has exactly the real element's metrics — including the awkward cases
 * (an `inline-flex` link inside a 16px/24px parent, a flex item whose
 * baseline is its icon) — instead of a hand-computed pixel height that
 * drifts the moment the type scale changes.
 * ------------------------------------------------------------------ */

/**
 * Inline ghost text: an invisible copy of `text` (so it takes the real
 * width and line box) with a hatched bar over it. Drop it wherever the
 * real element renders a run of text, inside the same flex/inline parent
 * the real one uses.
 */
export function BlueprintGhostText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={`relative ${className}`} aria-hidden="true">
      <span className="invisible whitespace-pre">{text}</span>
      <BlueprintFill className="absolute inset-x-0 inset-y-[0.22em]" />
    </span>
  );
}

/**
 * Block ghost lines: one block per entry in `widths`, each as tall as a
 * line of the real text (`className` carries its font size / leading, e.g.
 * `"text-[12.5px] leading-relaxed"`), with a bar of that width. For
 * paragraphs and for single heading lines alike.
 */
export function BlueprintGhostLines({
  widths,
  className = "text-[12.5px]",
}: {
  widths: string[];
  className?: string;
}) {
  return (
    <div className={className} aria-hidden="true">
      {widths.map((width, index) => (
        <div key={index} className="relative">
          <span className="invisible">&nbsp;</span>
          <BlueprintFill className={`absolute inset-y-[0.22em] left-0 ${width}`} />
        </div>
      ))}
    </div>
  );
}

/**
 * The "‹ Back to …" link every public detail and contribute page opens
 * with — same `mb-4 inline-flex items-center gap-1 text-[12.5px]` shell
 * as the real `<Link>`, a 14px chevron box where the SVG is (a box with
 * no text baseline, exactly as the SVG is), then ghost text.
 */
export function BlueprintBackLink({ text }: { text: string }) {
  return (
    <span className="mb-4 inline-flex items-center gap-1 text-[12.5px]" aria-hidden="true">
      <BlueprintFill className="h-3.5 w-3.5 rounded-[3px]" />
      <BlueprintGhostText text={text} />
    </span>
  );
}

/** The `mb-6 text-[12.5px]` breadcrumb line under the back link. */
export function BlueprintBreadcrumb({ text }: { text: string }) {
  return (
    <div className="mb-6 text-[12.5px]" aria-hidden="true">
      <BlueprintGhostText text={text} />
    </div>
  );
}

/**
 * One header button: `rounded-[8px] px-3.5 py-2 text-[13px]` around a
 * 14px icon box and ghost label — 37.5px tall with the 1px border the
 * secondary buttons have, 35.5px without (the accent "Contribute"
 * button). `note` adds the 12px text link the Contribute button carries
 * underneath it (`flex-col items-start gap-1.5`), which is why that
 * column — and so the whole header row — is taller than the logo.
 */
export function BlueprintHeaderButton({
  label,
  bordered = true,
  icon = true,
  note,
}: {
  label: string;
  bordered?: boolean;
  /** `false` for the one icon-less button ("Project overview" / "Tool overview"). */
  icon?: boolean;
  note?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-1.5" aria-hidden="true">
      <span
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-[8px] bg-blueprint/[0.05] px-3.5 py-2 text-[13px] font-medium ${
          bordered ? "border border-blueprint/25" : ""
        }`}
      >
        {icon ? <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" /> : null}
        <BlueprintGhostText text={label} />
      </span>
      {note ? <BlueprintGhostText text={note} className="text-[12px]" /> : null}
    </div>
  );
}

/**
 * The title block + button group row at the top of the public detail
 * (`/projects/:slug`, `/opensource-tools/:slug`) and contribute pages:
 * `mb-6 flex flex-wrap items-start justify-between gap-4`, a 56px logo,
 * an `h1` (`text-xl` = 28px line), the 12.5px meta row 6px under it,
 * then (contribute pages) the 12.5px `leading-relaxed` description.
 * `meta` is the already-built meta row; `description` adds the
 * description paragraph's two ghost lines.
 */
export function BlueprintPublicHeader({
  title,
  meta,
  buttons,
  description = false,
}: {
  title: string;
  meta: ReactNode;
  buttons: ReactNode;
  description?: boolean;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4" aria-hidden="true">
      <div className="flex items-start gap-4">
        <BlueprintFill className="h-14 w-14 shrink-0 rounded-[10px]" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="text-xl">
            <BlueprintGhostText text={title} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">{meta}</div>
          {description ? (
            <div className="max-w-[70ch]">
              <BlueprintGhostLines
                widths={["w-full", "w-2/3"]}
                className="text-[12.5px] leading-relaxed"
              />
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-2">{buttons}</div>
    </div>
  );
}

/**
 * The tab strip shared by every detail/contribute page
 * (`mb-4 flex gap-4 border-b`, each tab `-mb-px pb-[9px]` with a 14px
 * icon, 12.5px label and 1.5px bottom border). Labels are the real,
 * fixed tab names, ghosted so each tab is as wide as the real one.
 * `badges` marks the tabs that carry a count pill (10px text, `py-[1px]`).
 */
export function BlueprintTabStrip({
  labels,
  badges = [],
}: {
  labels: string[];
  badges?: number[];
}) {
  return (
    <div
      className="mb-4 flex gap-4 overflow-hidden border-b border-blueprint/15"
      aria-hidden="true"
    >
      {labels.map((label, index) => (
        <div
          key={label}
          className="-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-[1.5px] border-transparent pb-[9px] text-[12.5px]"
        >
          <BlueprintFill className="h-3.5 w-3.5 rounded-[3px]" />
          <BlueprintGhostText text={label} />
          {badges.includes(index) ? (
            <span className="rounded-full px-1.5 py-[1px] text-[10px]">
              <BlueprintGhostText text="12" />
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/**
 * `AiSummary`'s inset card (`mb-4 rounded-[8px] border p-4`) in its
 * loading state, which is what is on screen when the page first appears:
 * the small-caps "Summary" header (`mb-2`), the status line with its
 * 13px spinner (`mb-3`, 12px text) and `SkeletonLines count={3}` — three
 * 12px bars with 8px gaps. It resolves to a different height once the
 * summary arrives (or to a one-line sign-in/notice for signed-out
 * visitors), which no placeholder can predict; this is the one state
 * every visitor passes through.
 */
export function BlueprintAiSummary() {
  return (
    <div
      className="mb-4 rounded-[8px] border border-blueprint/20 bg-blueprint/[0.04] p-4"
      aria-hidden="true"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-[11px] tracking-wide">
          <BlueprintFill className="h-3.5 w-3.5 rounded-[3px]" />
          <BlueprintGhostText text="SUMMARY" />
        </div>
      </div>
      <div className="mb-3 flex items-center gap-2 text-[12px]">
        <BlueprintFill className="h-[13px] w-[13px] shrink-0 rounded-full" />
        <BlueprintGhostText text="Generating summary…" />
      </div>
      <div className="flex flex-col gap-2">
        <BlueprintFill className="h-3 w-full" />
        <BlueprintFill className="h-3 w-full" />
        <BlueprintFill className="h-3 w-2/3" />
      </div>
    </div>
  );
}

/**
 * A rail card heading — `m-0 mb-3 text-[11px] uppercase tracking-wide`
 * (16.5px line), optionally with the 14px icon the Clone / Share cards
 * put in front of it.
 */
function BlueprintRailHeading({ text, icon = false }: { text: string; icon?: boolean }) {
  return (
    <div className="mb-3 flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
      {icon ? <BlueprintFill className="h-3.5 w-3.5 rounded-[3px]" /> : null}
      <BlueprintGhostText text={text} />
    </div>
  );
}

/** The bordered `rounded-[10px] p-4` shell every rail card shares. */
function BlueprintRailCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-4">
      {children}
    </div>
  );
}

/**
 * `StatRow` (`ProjectDetailSidebar` / `ToolDetailSidebar`): a 12px line
 * with a 14px icon + label on the left and a value on the right.
 */
function BlueprintStatRow({ label, value = "1,234" }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <span className="inline-flex items-center gap-1.5">
        <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
        <BlueprintGhostText text={label} />
      </span>
      <BlueprintGhostText text={value} />
    </div>
  );
}

/** A copy-box row (Clone / Share): `px-2.5 py-2` box, 11px mono text, 28px copy button. */
function BlueprintCopyBox({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-[8px] border border-blueprint/20 px-2.5 py-2">
      <div className="min-w-0 flex-1 overflow-hidden font-mono text-[11px]">
        <BlueprintGhostText text={text} />
      </div>
      <BlueprintFill className="h-[26px] w-[26px] shrink-0 rounded-[6px]" />
    </div>
  );
}

/** The 36px avatar + two-line name block of the Maintainer card. */
function BlueprintMaintainerCard() {
  return (
    <BlueprintRailCard>
      <BlueprintRailHeading text="MAINTAINER" />
      <div className="flex items-center gap-2.5">
        <BlueprintFill className="h-9 w-9 shrink-0 rounded-full" />
        <div className="min-w-0">
          <div className="text-[13px] font-medium">
            <BlueprintGhostText text="Maintainer name" />
          </div>
          <div className="font-mono text-[11px]">
            <BlueprintGhostText text="@maintainer" />
          </div>
        </div>
      </div>
    </BlueprintRailCard>
  );
}

/**
 * The right-hand rail of `/projects/:slug` (`ProjectDetailSidebar`), card
 * for card: About (heading, description at `leading-relaxed`, tag row,
 * DevTunnel stats, GitHub stats, created/updated), Maintainer, Clone,
 * Share. The conditional "Task progress" and "Your match" cards are left
 * out: they only render for some projects / signed-in viewers, and a
 * skeleton that guessed them in would be wrong for everyone else.
 */
export function BlueprintProjectSidebar() {
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0" aria-hidden="true">
      <BlueprintRailCard>
        <BlueprintRailHeading text="ABOUT" />
        <div className="mb-3.5">
          <BlueprintGhostLines
            widths={["w-full", "w-full", "w-3/5"]}
            className="text-[12.5px] leading-relaxed"
          />
        </div>
        <div className="mb-3.5 flex flex-wrap gap-1.5">
          <BlueprintFill className="h-[21.75px] w-16 rounded-[5px]" />
          <BlueprintFill className="h-[21.75px] w-14 rounded-[5px]" />
          <BlueprintFill className="h-[21.75px] w-12 rounded-[5px]" />
        </div>
        <div className="flex flex-col gap-2 border-t border-blueprint/15 pt-3">
          <BlueprintStatRow label="DevTunnel contributors" value="12" />
          <BlueprintStatRow label="DevTunnel tasks" value="8" />
          <BlueprintStatRow label="Stars on DevTunnel" value="5" />
        </div>
        <div className="mt-3 flex flex-col gap-2 border-t border-blueprint/15 pt-3">
          <BlueprintStatRow label="Stars on GitHub" value="1,234 (1.2k)" />
          <BlueprintStatRow label="Forks" value="123" />
          <BlueprintStatRow label="Open issues" value="45" />
          <BlueprintStatRow label="GitHub contributors" value="67" />
          <BlueprintStatRow label="License" value="MIT" />
        </div>
        <div className="mt-3 flex flex-col gap-1.5 border-t border-blueprint/15 pt-3 text-[11.5px]">
          <span className="inline-flex items-center gap-1.5">
            <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
            <BlueprintGhostText text="Created 3 months ago" />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
            <BlueprintGhostText text="Updated 2 days ago" />
          </span>
        </div>
      </BlueprintRailCard>

      <BlueprintMaintainerCard />

      <BlueprintRailCard>
        <BlueprintRailHeading text="CLONE" icon />
        <BlueprintCopyBox text="git clone https://github.com/owner/repo.git" />
      </BlueprintRailCard>

      <BlueprintRailCard>
        <BlueprintRailHeading text="SHARE" icon />
        <BlueprintCopyBox text="https://devtunnel.dev/projects/project-name" />
      </BlueprintRailCard>
    </aside>
  );
}

/**
 * The right-hand rail of `/opensource-tools/:slug` (`ToolDetailSidebar`):
 * the same About / Maintainer / Clone / Share stack, but a tool's About
 * card carries a single DevTunnel stat row (just "Stars on DevTunnel")
 * and one repository block (5 rows) — no DevTunnel contributor / task
 * rows — and only one "Added …" date line besides "Updated". Drawn for a
 * tool that has a repository, the common case; one without it ends up
 * with the Maintainer and Clone cards and the GitHub stat block missing.
 */
export function BlueprintToolSidebar() {
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0" aria-hidden="true">
      <BlueprintRailCard>
        <BlueprintRailHeading text="ABOUT" />
        <div className="mb-3.5">
          <BlueprintGhostLines
            widths={["w-full", "w-full", "w-3/5"]}
            className="text-[12.5px] leading-relaxed"
          />
        </div>
        <div className="mb-3.5 flex flex-wrap gap-1.5">
          <BlueprintFill className="h-[21.75px] w-16 rounded-[5px]" />
          <BlueprintFill className="h-[21.75px] w-14 rounded-[5px]" />
        </div>
        <div className="flex flex-col gap-2 border-t border-blueprint/15 pt-3">
          <BlueprintStatRow label="Stars on DevTunnel" value="5" />
        </div>
        <div className="mt-3 flex flex-col gap-2 border-t border-blueprint/15 pt-3">
          <BlueprintStatRow label="Stars on GitHub" value="1,234 (1.2k)" />
          <BlueprintStatRow label="Forks" value="123" />
          <BlueprintStatRow label="Open issues" value="45" />
          <BlueprintStatRow label="Contributors" value="67" />
          <BlueprintStatRow label="License" value="MIT" />
        </div>
        <div className="mt-3 flex flex-col gap-1.5 border-t border-blueprint/15 pt-3 text-[11.5px]">
          <span className="inline-flex items-center gap-1.5">
            <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
            <BlueprintGhostText text="Added 3 months ago" />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
            <BlueprintGhostText text="Updated 2 days ago" />
          </span>
        </div>
      </BlueprintRailCard>

      <BlueprintMaintainerCard />

      <BlueprintRailCard>
        <BlueprintRailHeading text="CLONE" icon />
        <BlueprintCopyBox text="git clone https://github.com/owner/repo.git" />
      </BlueprintRailCard>

      <BlueprintRailCard>
        <BlueprintRailHeading text="SHARE" icon />
        <BlueprintCopyBox text="https://devtunnel.dev/opensource-tools/tool-name" />
      </BlueprintRailCard>
    </aside>
  );
}

/**
 * The Info tab's panel (`rounded-[10px] border p-5`): the AI summary
 * inset, then the 180px / 1fr definition grid (12.5px rows, `gap-y-3`,
 * `gap-x-6`) — `rows` label/value pairs — then the tag block under a
 * `border-t pt-4` rule (11px heading with `mb-2`, then 10.5px tags).
 * `rows` is the real count: 9 for a project, 5–8 for a tool depending on
 * whether it has a repository.
 */
export function BlueprintInfoPanel({
  rows,
  tagHeading,
}: {
  rows: number;
  tagHeading: string;
}) {
  return (
    <div
      className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-5"
      aria-hidden="true"
    >
      <BlueprintAiSummary />
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-[180px_1fr]">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="contents">
            <BlueprintGhostText text="Label" className="w-fit" />
            <BlueprintGhostText text="Value goes here" className="w-fit" />
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-blueprint/15 pt-4">
        <div className="mb-2 text-[11px] uppercase tracking-wide">
          <BlueprintGhostText text={tagHeading} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["w-16", "w-14", "w-[72px]", "w-12", "w-16"].map((width, index) => (
            <BlueprintFill key={index} className={`h-[21.75px] ${width} rounded-[5px]`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The filter-chip pill used by both contribute panels
 * (`rounded-[7px] border px-2.5 py-1 text-[12px]`, label + an 11px count):
 * 28px tall.
 */
function BlueprintChip({ label, count = "12", className = "" }: { label: string; count?: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[7px] border border-blueprint/20 px-2.5 py-1 text-[12px] ${className}`}
    >
      <BlueprintGhostText text={label} />
      <BlueprintGhostText text={count} className="text-[11px]" />
    </span>
  );
}

/**
 * The "DevTunnel tasks" panel body of the contribute page
 * (`ContributeTasksPanel`), the tab the page opens on when the target has
 * tasks: the five status chips (`mb-3`), the search + role + difficulty
 * row (`mb-4`; 32.75px — the input's 18.75px line plus `py-1.5` and the
 * border), the "Showing x of y tasks" line (`mb-2.5`), then `rows`
 * task cards (`gap-2`, `rounded-[9px] p-3.5`): 13px title with a status
 * badge, a 11.5px meta line (`mt-2`), tag row + "View task" (`mt-2.5`,
 * 21.75px) and the "Explain" button row under a rule (`mt-2.5 pt-2.5`,
 * 31.25px) that every task linked to a GitHub issue carries.
 */
export function BlueprintContributeTasksPanel({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden="true">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {[
          { label: "All", count: "12" },
          { label: "Open", count: "7" },
          { label: "In progress", count: "3" },
          { label: "In review", count: "1" },
          { label: "Done", count: "1" },
        ].map(({ label, count }) => (
          <BlueprintChip key={label} label={label} count={count} />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[180px] flex-1 items-center gap-2 rounded-[8px] border border-blueprint/20 px-2.5 py-1.5">
          <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
          <BlueprintGhostText text="Search tasks" className="text-[12.5px]" />
        </div>
        <span className="rounded-[8px] border border-blueprint/20 px-2.5 py-1.5 text-[12.5px]">
          <BlueprintGhostText text="Any role" />
        </span>
        <span className="rounded-[8px] border border-blueprint/20 px-2.5 py-1.5 text-[12.5px]">
          <BlueprintGhostText text="Any difficulty" />
        </span>
      </div>

      <div className="mb-2.5 text-[11.5px]">
        <BlueprintGhostText text="Showing 12 of 12 tasks" />
      </div>

      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="rounded-[9px] border border-blueprint/15 bg-blueprint/[0.07] p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 text-[13px] font-medium">
                <BlueprintGhostText text="Task title goes here and can run long" />
              </div>
              <BlueprintFill className="h-[21px] w-16 shrink-0 rounded-full" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px]">
              <BlueprintGhostText text="Backend, Frontend" />
              <span className="text-blueprint/50">·</span>
              <BlueprintGhostText text="Intermediate" />
              <span className="text-blueprint/50">·</span>
              <BlueprintGhostText text="2 working" />
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <BlueprintFill className="h-[21.75px] w-16 rounded-[5px]" />
                <BlueprintFill className="h-[21.75px] w-14 rounded-[5px]" />
              </div>
              <BlueprintGhostText text="View task ›" className="text-[11px]" />
            </div>
            <div className="mt-2.5 border-t border-blueprint/15 pt-2.5">
              <BlueprintFill className="h-[31.25px] w-28 rounded-[7px]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The "Ways to contribute" panel body (`ContributionWaysPanel`), the tab
 * the page opens on when the target has no tasks. It is static content,
 * so the shape is known: the category chips (`mb-4`, "Everything" + the
 * four categories + a right-aligned "No coding needed"), then each
 * category as a heading block (`mb-2.5`: 13px title, 12px summary 2px
 * under it) over a two-column grid of way cards (`gap-2`,
 * `rounded-[9px] p-3.5`: 13px title, 12px `leading-relaxed` description
 * `mt-1.5`, 11.5px effort line `mt-2.5`), sections 24px apart.
 */
export function BlueprintWaysPanel() {
  const sections = [6, 4];
  return (
    <div aria-hidden="true">
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <BlueprintChip label="Everything" count="22" />
        <BlueprintChip label="Code" count="6" />
        <BlueprintChip label="Non-code" count="6" />
        <BlueprintChip label="Process and tooling" count="5" />
        <BlueprintChip label="Community" count="5" />
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-[7px] border border-blueprint/20 px-2.5 py-1 text-[12px]">
          <BlueprintGhostText text="No coding needed" />
        </span>
      </div>

      <div className="flex flex-col gap-6">
        {sections.map((cards, sectionIndex) => (
          <section key={sectionIndex}>
            <div className="mb-2.5 flex items-start gap-2">
              <BlueprintFill className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded-[3px]" />
              <div>
                <div className="text-[13px] font-medium">
                  <BlueprintGhostText text="Category name" />
                </div>
                <div className="mt-0.5 text-[12px]">
                  <BlueprintGhostText text="One-line summary of what this group covers" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Array.from({ length: cards }).map((_, index) => (
                <div
                  key={index}
                  className="flex flex-col rounded-[9px] border border-blueprint/15 bg-blueprint/[0.07] p-3.5"
                >
                  <div className="flex items-start gap-2">
                    <BlueprintFill className="mt-[2px] h-3.5 w-3.5 shrink-0 rounded-[3px]" />
                    <div className="flex-1 text-[13px] font-medium">
                      <BlueprintGhostText text="Way to contribute" />
                    </div>
                  </div>
                  <div className="mt-1.5">
                    <BlueprintGhostLines
                      widths={["w-full", "w-full", "w-1/2"]}
                      className="text-[12px] leading-relaxed"
                    />
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                    <BlueprintGhostText text="Small first step" />
                    <BlueprintGhostText text="Open on GitHub" className="ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * The contribute page's right rail (`ContributeSidebar`), card for card:
 * "Before your first change" (four 12.5px links `gap-2`, then the
 * open-issues line under a rule), "Clone your fork" (copy box on the
 * page background, then a 3-line 11.5px note), "What you'll be working
 * in" (tag row, license line under a rule), "Why people start" (six
 * 12.5px titles each over an 11.5px detail, `gap-2.5`) and "Elsewhere on
 * DevTunnel" (three links). The tags card is omitted by passing
 * `withTags={false}` for a target with no tech stack.
 */
export function BlueprintContributeSidebar({ withTags = true }: { withTags?: boolean }) {
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0" aria-hidden="true">
      <BlueprintRailCard>
        <BlueprintRailHeading text="BEFORE YOUR FIRST CHANGE" />
        <div className="flex flex-col gap-2 text-[12.5px]">
          {["CONTRIBUTING.md", "README.md", "Code of conduct", "Open issues"].map((label) => (
            <div key={label}>
              <BlueprintGhostText text={label} />
            </div>
          ))}
        </div>
        <div className="mt-3 border-t border-blueprint/15 pt-3 text-[12px]">
          <BlueprintGhostText text="45 open issues on GitHub" />
        </div>
      </BlueprintRailCard>

      <BlueprintRailCard>
        <BlueprintRailHeading text="CLONE YOUR FORK" />
        <div className="flex items-center gap-2 rounded-[8px] border border-blueprint/20 px-2.5 py-2">
          <div className="min-w-0 flex-1 overflow-hidden font-mono text-[11.5px]">
            <BlueprintGhostText text="git clone https://github.com/owner/repo.git" />
          </div>
          <BlueprintFill className="h-[26px] w-[26px] shrink-0 rounded-[6px]" />
        </div>
        <div className="mt-2">
          <BlueprintGhostLines widths={["w-full", "w-full", "w-2/3"]} className="text-[11.5px]" />
        </div>
      </BlueprintRailCard>

      {withTags ? (
        <BlueprintRailCard>
          <BlueprintRailHeading text="WHAT YOU'LL BE WORKING IN" />
          <div className="flex flex-wrap gap-1.5">
            <BlueprintFill className="h-[21.75px] w-16 rounded-[5px]" />
            <BlueprintFill className="h-[21.75px] w-14 rounded-[5px]" />
            <BlueprintFill className="h-[21.75px] w-12 rounded-[5px]" />
          </div>
          <div className="mt-3 border-t border-blueprint/15 pt-3 text-[12px]">
            <BlueprintGhostText text="Licensed MIT" />
          </div>
        </BlueprintRailCard>
      ) : null}

      <BlueprintRailCard>
        <BlueprintRailHeading text="WHY PEOPLE START" />
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index}>
              <div className="text-[12.5px]">
                <BlueprintGhostText text="You hit the problem yourself" />
              </div>
              <div className="mt-0.5 text-[11.5px]">
                <BlueprintGhostText text="A short line of detail under it" />
              </div>
            </div>
          ))}
        </div>
      </BlueprintRailCard>

      <BlueprintRailCard>
        <BlueprintRailHeading text="ELSEWHERE ON DEVTUNNEL" />
        <div className="flex flex-col gap-2 text-[12.5px]">
          {["Tasks across every project", "All open issues", "Browse other projects"].map((label) => (
            <div key={label}>
              <BlueprintGhostText text={label} />
            </div>
          ))}
        </div>
      </BlueprintRailCard>
    </aside>
  );
}

/* ------------------------------------------------------------------ *
 * Task / issue list + task detail primitives.
 *
 * Same ghost-text approach as the detail/contribute primitives above:
 * every line reserves its height with real, invisible text set in the
 * real element's font size and leading, so the skeleton is exactly as
 * tall as the page that replaces it.
 * ------------------------------------------------------------------ */

/**
 * A wrapping ghost paragraph: invisible copy of `text` (so it wraps at
 * the same widths and takes the same number of lines as the real one)
 * with a single hatched block laid over it. Use it for copy that can
 * wrap; `BlueprintGhostText` is for single-line runs.
 */
export function BlueprintGhostParagraph({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`} aria-hidden="true">
      <span className="invisible">{text}</span>
      <BlueprintFill className="absolute inset-x-0 inset-y-[0.22em]" />
    </div>
  );
}

/**
 * Title + subtitle of the list pages (`/tasks`, `/issues`): `mb-8`, an
 * `h1` (`mb-1 text-xl` = 28px line) and a `text-sm` paragraph (20px
 * lines) that wraps — so both are ghosted from the real copy rather than
 * drawn as fixed-height bars.
 */
export function BlueprintListPageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-8" aria-hidden="true">
      <div className="mb-1 text-xl font-medium">
        <BlueprintGhostText text={title} />
      </div>
      <BlueprintGhostParagraph text={description} className="text-sm" />
    </div>
  );
}

/** The 6px status dot + word used by task status and issue state. */
function BlueprintStatusWord({ text, className = "text-[12.5px]" }: { text: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <BlueprintFill className="h-[6px] w-[6px] shrink-0 rounded-full" />
      <BlueprintGhostText text={text} />
    </span>
  );
}

/**
 * N card placeholders matching `TasksTable` (`variant="task"`) and
 * `IssuesTable` (`variant="issue"`), line for line:
 *
 *  - `px-4 py-3.5 sm:px-5` inside a `rounded-[10px]` card, `gap-3` apart;
 *  - title row: `text-[14.5px] leading-snug` title (an issue's has a 14px
 *    icon in front) and the status word on the right (`pt-0.5`, 12.5px);
 *  - meta line, `mt-1.5`, 12px: a task has repo logo + project + mono
 *    repository + `#issue`; an issue has `#number`, the same repo group
 *    and `@author`;
 *  - chip row, `mt-3`: difficulty / roles / tech (23.25px chips at
 *    11.5px) for a task, GitHub labels for an issue;
 *  - footer, `mt-3.5 border-t pt-3`: 12px counts (task) or dates (issue)
 *    on the left, the 31.25px "Explain" toggle and the 12px "View …"
 *    link (`py-1.5`) on the right.
 */
export function BlueprintTaskCardList({
  rows = 6,
  variant = "task",
}: {
  rows?: number;
  variant?: "task" | "issue";
}) {
  const isTask = variant === "task";
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05]">
          <div className="px-4 py-3.5 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 overflow-hidden text-[14.5px] font-medium leading-snug">
                {isTask ? (
                  <BlueprintGhostText text="Task title that describes the work to be done" />
                ) : (
                  <span className="inline-flex items-start gap-1.5">
                    <BlueprintFill className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded-[3px]" />
                    <BlueprintGhostText text="Issue title that describes the problem" />
                  </span>
                )}
              </div>
              <span className="shrink-0 pt-0.5">
                <BlueprintStatusWord text={isTask ? "In progress" : "Open"} />
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
              {isTask ? null : <BlueprintGhostText text="#1234" className="font-mono text-[11.5px]" />}
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-full" />
                <BlueprintGhostText text="Project name" />
                <BlueprintGhostText text="owner/repository-name" className="font-mono text-[11px]" />
              </span>
              {isTask ? (
                <span className="inline-flex items-center gap-1 font-mono text-[11.5px]">
                  <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
                  <BlueprintGhostText text="#1234" />
                </span>
              ) : (
                <BlueprintGhostText text="@username" />
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {(isTask ? ["w-[84px]", "w-[72px]", "w-16", "w-20"] : ["w-16", "w-20", "w-14"]).map(
                (width, chipIndex) => (
                  <BlueprintFill key={chipIndex} className={`h-[23.25px] ${width} rounded-md`} />
                ),
              )}
            </div>

            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-blueprint/15 pt-3">
              <div className="text-[12px]">
                <BlueprintGhostText
                  text={isTask ? "1 working · 2 completed" : "Created Jan 5, 2026 · Updated Feb 12, 2026"}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-[7px] border border-blueprint/20 px-2.5 py-1.5 text-[11.5px] font-medium">
                  <BlueprintFill className="h-3 w-3 shrink-0 rounded-[3px]" />
                  <BlueprintGhostText text="Explain" />
                  <BlueprintFill className="h-3 w-3 shrink-0 rounded-[3px]" />
                </span>
                <span className="inline-flex items-center gap-1 rounded-[7px] px-2.5 py-1.5 text-[12px] font-medium">
                  <BlueprintGhostText text={isTask ? "View task →" : "View on GitHub →"} />
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The "Showing the N most recently updated open issues … / Load all
 * issues" row (`LoadIssueListBar`) above the `/issues` list: `mb-3`, a
 * 12px line left, a `py-1.5` 12px button (32px) right.
 */
export function BlueprintLoadIssueListBar() {
  return (
    <div
      className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
      aria-hidden="true"
    >
      <div className="text-[12px]">
        <BlueprintGhostText text="Showing the 100 most recently updated open issues — search and" />
      </div>
      <span className="inline-flex shrink-0 items-center rounded-[8px] border border-blueprint/25 px-3 py-1.5 text-[12px] font-medium">
        <BlueprintGhostText text="Load all issues" />
      </span>
    </div>
  );
}

/**
 * `IssuesInsightsCard` in its idle state, above the `/issues` filters:
 * `mb-4 rounded-[8px] p-4`, the sparkle + small-caps title row (`mb-2`),
 * then the 12.5px explanation beside a 32px "Analyze this page" button.
 */
export function BlueprintIssueInsightsCard() {
  return (
    <div
      className="mb-4 rounded-[8px] border border-blueprint/20 bg-blueprint/[0.04] p-4"
      aria-hidden="true"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
          <BlueprintFill className="h-3.5 w-3.5 rounded-[3px]" />
          <BlueprintGhostText text="Issue insights" />
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <BlueprintGhostParagraph
          className="text-[12.5px]"
          text="Let AI label the issues on this page by role, level and technology so you can filter to what suits you. It works one page at a time to keep AI usage low."
        />
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-blueprint/25 px-3 py-1.5 text-[12px] font-medium">
          <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
          <BlueprintGhostText text="Analyze this page" />
        </span>
      </div>
    </div>
  );
}

/** The "Showing X–Y of Z tasks — page 1 of N" footer with the real line height. */
export function BlueprintListPagination({ itemLabel }: { itemLabel: string }) {
  return (
    <div
      className="mt-4 flex flex-col gap-3 border-t border-blueprint/25 pt-4 sm:flex-row sm:items-center sm:justify-between"
      aria-hidden="true"
    >
      <div className="text-[11.5px]">
        <BlueprintGhostText text={`Showing 1–10 of 48 ${itemLabel}s — page 1 of 5`} />
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <BlueprintFill className="h-8 w-[72px]" />
        {Array.from({ length: 4 }).map((_, index) => (
          <BlueprintFill key={index} className="h-8 w-[30px]" />
        ))}
        <BlueprintFill className="h-8 w-[52px]" />
      </div>
    </div>
  );
}

/* ---------------- Task detail + task contribute ------------------- */

/** `rounded-[10px] border p-5` section shell of the task pages. */
function BlueprintTaskSection({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-5" aria-hidden="true">
      {children}
    </div>
  );
}

/** `m-0 text-[11px] uppercase tracking-wide` section heading (16.5px line). */
function BlueprintTaskHeading({ text, className = "mb-3" }: { text: string; className?: string }) {
  return (
    <div className={`${className} text-[11px] uppercase tracking-wide`}>
      <BlueprintGhostText text={text} />
    </div>
  );
}

/**
 * Title block + buttons at the top of `/projects/:slug/tasks/:id` and its
 * `/contribute` page: `mb-6 flex flex-wrap items-start justify-between
 * gap-4`, an `h1` (`mb-1.5 text-xl`), the 12.5px meta row (logo + project,
 * mono repository link, status word) and the header buttons.
 */
export function BlueprintTaskHeader({
  title,
  buttons,
}: {
  title: string;
  buttons: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4" aria-hidden="true">
      <div className="min-w-0">
        <div className="mb-1.5 overflow-hidden text-xl font-medium">
          <BlueprintGhostText text={title} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px]">
          <span className="inline-flex items-center gap-1.5">
            <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-full" />
            <BlueprintGhostText text="Project name" />
          </span>
          <span className="text-blueprint/50">·</span>
          <span className="inline-flex items-center gap-1.5 font-mono">
            <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
            <BlueprintGhostText text="owner/repository-name" />
          </span>
          <span className="text-blueprint/50">·</span>
          <BlueprintStatusWord text="In progress" />
        </div>
      </div>
      <div className="flex flex-wrap items-start gap-2">{buttons}</div>
    </div>
  );
}

/**
 * `TaskProgressTracker`: `p-5` card, "PROGRESS" heading (`mb-4`), four
 * stage columns (`grid-cols-2 sm:grid-cols-4`, `gap-x-3 gap-y-4`) each a
 * 4px bar, a 12.5px label line with a 14px marker, and the 11.5px
 * `leading-snug` stage description (which wraps to two lines at the
 * four-column width), then the 12.5px `leading-relaxed` summary sentence
 * under a `mt-4 border-t pt-3` rule.
 */
export function BlueprintTaskTracker() {
  const stages = [
    { label: "Open", description: "Available to pick up" },
    { label: "Started", description: "Forked and being worked on" },
    { label: "PR submitted", description: "Pull request open, waiting on review" },
    { label: "Done", description: "Completed" },
  ];
  return (
    <BlueprintTaskSection>
      <BlueprintTaskHeading text="Progress" className="mb-4" />
      <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4">
        {stages.map((stage) => (
          <div key={stage.label}>
            <BlueprintFill className="block h-1 w-full rounded-full" />
            <div className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium">
              <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-full" />
              <BlueprintGhostText text={stage.label} />
            </div>
            <BlueprintGhostParagraph
              text={stage.description}
              className="mt-0.5 text-[11.5px] leading-snug"
            />
          </div>
        ))}
      </div>
      <div className="mt-4 border-t border-blueprint/15 pt-3">
        <BlueprintGhostParagraph
          text="Nobody has started this task yet — it's available to pick up."
          className="text-[12.5px] leading-relaxed"
        />
      </div>
    </BlueprintTaskSection>
  );
}

/** The inset, bordered body box of the description / issue sections (`rounded-md border p-4`). */
function BlueprintMarkdownBox({ lines = 6 }: { lines?: number }) {
  return (
    <div className="rounded-md border border-blueprint/15 p-4">
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, index) => (
          <BlueprintFill key={index} className={`h-3 ${index === lines - 1 ? "w-2/3" : "w-full"}`} />
        ))}
      </div>
    </div>
  );
}

/** "About the project": heading row, 40px logo, name, mono repo link, description, compact progress bar. */
export function BlueprintTaskProjectSection() {
  return (
    <BlueprintTaskSection>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide">
          <BlueprintGhostText text="About the project" />
        </div>
        <div className="text-[12px] font-medium">
          <BlueprintGhostText text="View project" />
        </div>
      </div>
      <div className="flex items-start gap-3">
        <BlueprintFill className="h-10 w-10 shrink-0 rounded-[10px]" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium">
            <BlueprintGhostText text="Project name" />
          </div>
          <div className="mt-0.5 inline-flex items-center gap-1.5 font-mono text-[12px]">
            <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
            <BlueprintGhostText text="owner/repository-name" />
          </div>
          <BlueprintGhostParagraph
            className="mt-3 text-[13px] leading-relaxed"
            text="A short description of the project and what it does, so a contributor can tell why this work matters before picking it up."
          />
          <div className="mt-4 border-t border-blueprint/15 pt-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-[12.5px]">
              <BlueprintGhostText text="3 of 12 tasks done" />
              <BlueprintGhostText text="25%" className="text-[11.5px]" />
            </div>
            <BlueprintFill className="h-1.5 w-full rounded-full" />
          </div>
        </div>
      </div>
    </BlueprintTaskSection>
  );
}

/** "Task description": heading plus the inset markdown box. */
export function BlueprintTaskDescriptionSection() {
  return (
    <BlueprintTaskSection>
      <BlueprintTaskHeading text="Task description" />
      <BlueprintMarkdownBox lines={5} />
    </BlueprintTaskSection>
  );
}

/**
 * `TaskAiExplainCard` in its idle state: `p-5` card, sparkle + small-caps
 * title (`mb-2`), the 12.5px `leading-relaxed` blurb beside a 32px
 * "Explain with AI" button (stacked below `sm`).
 */
export function BlueprintTaskAiCard({ variant = "view" }: { variant?: "view" | "contribute" }) {
  const copy =
    variant === "view"
      ? "Not sure what this task is asking for? Let AI read the GitHub issue and explain it in plain language — what needs doing, the skills involved and where to start."
      : "About to start? Let AI read the GitHub issue and suggest first steps, the skills you'll need and what to watch out for.";
  return (
    <BlueprintTaskSection>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
          <BlueprintFill className="h-3.5 w-3.5 rounded-[3px]" />
          <BlueprintGhostText text="Explain this task" />
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BlueprintGhostParagraph text={copy} className="text-[12.5px] leading-relaxed" />
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-blueprint/25 px-3 py-1.5 text-[12px] font-medium">
          <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
          <BlueprintGhostText text="Explain with AI" />
        </span>
      </div>
    </BlueprintTaskSection>
  );
}

/** "Issue description": heading row with the GitHub link, `#n title`, state line, inset markdown box. */
export function BlueprintTaskIssueSection() {
  return (
    <BlueprintTaskSection>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-wide">
          <BlueprintGhostText text="Issue description" />
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
          <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
          <BlueprintGhostText text="View #1234 on GitHub" />
        </span>
      </div>
      <div className="flex items-start gap-2 text-[13.5px] font-medium">
        <BlueprintGhostText text="#1234" className="font-mono font-normal" />
        <BlueprintGhostText text="Title of the original GitHub issue" />
      </div>
      <div className="mb-3 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <BlueprintStatusWord text="Open on GitHub" className="text-[12px]" />
        <span className="text-blueprint/50">·</span>
        <BlueprintGhostText text="Opened by username" />
      </div>
      <BlueprintMarkdownBox lines={9} />
    </BlueprintTaskSection>
  );
}

/**
 * `TaskDetailSidebar`: a 280px rail with "Details" (92px / 1fr definition
 * grid, 12.5px rows, `gap-y-3`: status, role, difficulty, contributors)
 * and "Tech stack" (23.25px chips).
 */
export function BlueprintTaskSidebar() {
  const rows: { label: string; value: string }[] = [
    { label: "Status", value: "In progress" },
    { label: "Role", value: "Frontend, Backend" },
    { label: "Difficulty", value: "Intermediate" },
    { label: "Contributors", value: "1 working · 2 completed" },
  ];
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0" aria-hidden="true">
      <BlueprintTaskSection>
        <BlueprintTaskHeading text="Details" />
        <div className="grid grid-cols-[92px_1fr] gap-x-4 gap-y-3 text-[12.5px]">
          {rows.map((row, index) => (
            <div key={row.label} className="contents">
              <BlueprintGhostText text={row.label} className="w-fit" />
              {index === 0 ? (
                <span>
                  <BlueprintStatusWord text={row.value} />
                </span>
              ) : (
                <BlueprintGhostText text={row.value} className="w-fit" />
              )}
            </div>
          ))}
        </div>
      </BlueprintTaskSection>
      <BlueprintTaskSection>
        <BlueprintTaskHeading text="Tech stack" />
        <div className="flex flex-wrap gap-1.5">
          {["w-[72px]", "w-16", "w-20", "w-14", "w-[68px]"].map((width, index) => (
            <BlueprintFill key={index} className={`h-[23.25px] ${width} rounded-md`} />
          ))}
        </div>
      </BlueprintTaskSection>
    </aside>
  );
}

/** One numbered step card of the task Contribute page (`rounded-[9px] border p-3.5`). */
function BlueprintStepCard({
  title,
  detail,
  commandLines,
  checkbox = false,
  note,
}: {
  title: string;
  detail: string;
  /** Lines in the `CommandBlock` under the detail; omit for a step without commands. */
  commandLines?: number;
  checkbox?: boolean;
  note?: string;
}) {
  return (
    <div className="rounded-[9px] border border-blueprint/15 bg-blueprint/[0.07] p-3.5">
      <div className="flex items-start gap-3">
        {checkbox ? <BlueprintFill className="mt-[3px] h-3.5 w-3.5 shrink-0 rounded-[3px]" /> : null}
        <div className="min-w-0 flex-1">
          <div className="overflow-hidden text-[13px] font-medium">
            <BlueprintGhostText text={`1  ${title}`} />
          </div>
          <BlueprintGhostParagraph text={detail} className="mt-1.5 text-[12px] leading-relaxed" />
          {commandLines ? (
            <div className="mt-2.5 flex items-start gap-2 rounded-[8px] border border-blueprint/15 px-3 py-2.5">
              <div className="min-w-0 flex-1 font-mono text-[11.5px] leading-relaxed">
                {Array.from({ length: commandLines }).map((_, index) => (
                  <BlueprintGhostLines key={index} widths={["w-4/5"]} className="text-[11.5px] leading-relaxed" />
                ))}
              </div>
              <BlueprintFill className="h-[26px] w-[26px] shrink-0 rounded-[6px]" />
            </div>
          ) : null}
          {note ? <BlueprintGhostParagraph text={note} className="mt-2 text-[11.5px]" /> : null}
        </div>
      </div>
    </div>
  );
}

/** "The task" summary card of the task Contribute page. */
export function BlueprintContributeTaskSummary() {
  return (
    <BlueprintTaskSection>
      <BlueprintTaskHeading text="The task" />
      <div className="text-[14px] font-medium">
        <BlueprintGhostText text="Task title that describes the work to be done" />
      </div>
      <BlueprintGhostParagraph
        text="From GitHub issue #1234 — Title of the original GitHub issue"
        className="mt-1 text-[12.5px]"
      />
      <div className="mt-4 grid grid-cols-[92px_1fr] gap-x-4 gap-y-2.5 text-[12.5px]">
        <BlueprintGhostText text="Role" className="w-fit" />
        <BlueprintGhostText text="Frontend, Backend" className="w-fit" />
        <BlueprintGhostText text="Difficulty" className="w-fit" />
        <BlueprintGhostText text="Intermediate" className="w-fit" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["w-[72px]", "w-16", "w-20"].map((width, index) => (
          <BlueprintFill key={index} className={`h-[23.25px] ${width} rounded-md`} />
        ))}
      </div>
      <div className="mt-4 border-t border-blueprint/15 pt-3">
        <BlueprintGhostParagraph
          text="Read the full brief and the original issue on the task page before you start."
          className="text-[12px]"
        />
      </div>
    </BlueprintTaskSection>
  );
}

/** "Fastest way: the DevTunnel CLI" card: heading block, five single-command steps, the `dev test` note. */
export function BlueprintContributeCliSection() {
  const steps = [
    ["Install the CLI", "Install the DevTunnel command-line tool once on your machine."],
    ["Sign in with GitHub", "Authenticate so the CLI can fork and open pull requests for you."],
    ["Start this task", "Forks the repository and creates a branch for this task."],
    ["Run the tests", "Run the project's checks before you submit anything."],
    ["Submit your work", "Pushes your branch and opens the pull request."],
  ];
  return (
    <BlueprintTaskSection>
      <div className="mb-4">
        <div className="text-[13px] font-medium">
          <BlueprintGhostText text="Fastest way: the DevTunnel CLI" />
        </div>
        <BlueprintGhostParagraph
          className="mt-1 text-[12px] leading-relaxed"
          text="The dev CLI forks the repository, creates a branch for this task, and opens the pull request for you. The task ID is already filled in — copy the commands exactly as shown."
        />
      </div>
      <div className="flex flex-col gap-2">
        {steps.map(([title, detail]) => (
          <BlueprintStepCard key={title} title={title} detail={detail} commandLines={1} />
        ))}
      </div>
      <BlueprintGhostParagraph
        className="mt-3 text-[11.5px]"
        text="You can run dev test as many times as you like between starting and submitting."
      />
    </BlueprintTaskSection>
  );
}

/** The manual fork-to-PR card: intro, workflow heading + counter, CONTRIBUTING.md link bar, eight tickable steps. */
export function BlueprintContributeManualSection() {
  const steps: { title: string; detail: string; commandLines?: number; note?: string }[] = [
    { title: "Read the contributing guide first", detail: "Check the project's own rules for branches, commits and tests before you change anything." },
    { title: "Claim the work before you write it", detail: "Comment on the issue so maintainers and other contributors know you are on it." },
    { title: "Fork, then clone your fork", detail: "Work on your own copy of the repository and keep the original as upstream.", commandLines: 3 },
    { title: "Create a branch for the change", detail: "Keep each change on its own branch so the pull request stays small.", commandLines: 1 },
    { title: "Set up, change, and test locally", detail: "Follow the project's setup steps, make the change and run its tests." },
    { title: "Commit with a message that explains the change", detail: "Say what changed and link the issue so reviewers have the context.", commandLines: 2 },
    { title: "Push and open the pull request", detail: "Push the branch to your fork and open the pull request against the project.", commandLines: 1, note: "Then open the PR against owner/repository-name." },
    { title: "Respond to review until it merges", detail: "Answer review comments and push follow-up commits to the same branch." },
  ];
  return (
    <BlueprintTaskSection>
      <BlueprintGhostParagraph
        className="mb-4 text-[12.5px] leading-relaxed"
        text="Prefer to work without the CLI? The same result by hand — fork, branch, commit and open the pull request yourself, linking issue #1234."
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[13px] font-medium">
            <BlueprintGhostText text="From forked repository to merged pull request" />
          </div>
          <div className="mt-1 text-[12px]">
            <BlueprintGhostText text="Tick steps off as you go. This is a scratchpad for this visit — nothing is saved." />
          </div>
        </div>
        <div className="text-[11.5px]">
          <BlueprintGhostText text="0 of 8 ticked" />
        </div>
      </div>
      <div className="mb-4 flex items-center justify-between gap-3 rounded-[9px] border border-blueprint/20 px-3.5 py-2.5 text-[12.5px]">
        <div className="min-w-0 flex-1 overflow-hidden">
          <BlueprintGhostText text="This project's own contributing guide overrides anything below it." />
        </div>
        <BlueprintGhostText text="Read CONTRIBUTING.md" className="shrink-0 font-medium" />
      </div>
      <div className="flex flex-col gap-2">
        {steps.map((step) => (
          <BlueprintStepCard key={step.title} checkbox {...step} />
        ))}
      </div>
    </BlueprintTaskSection>
  );
}

/* ------------------------------------------------------------------ *
 * GitHub catalog + Community submission view pages.
 * ------------------------------------------------------------------ */

/**
 * The right-hand rail of `/github-projects/:slug` and
 * `/github-open-source-tools/:slug` (`GithubProjectSidebar`), card for
 * card: About (description at `leading-relaxed`, language + tech tags,
 * the five GitHub stat rows, created / updated), Maintainer, Clone and
 * Share. Unlike `BlueprintProjectSidebar` there are no DevTunnel stat
 * rows — these repositories are raw catalog entries — and the stat labels
 * are the plain "Stars" / "Forks" / "Contributors".
 */
export function BlueprintGithubSidebar() {
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0" aria-hidden="true">
      <BlueprintRailCard>
        <BlueprintRailHeading text="ABOUT" />
        <div className="mb-3.5">
          <BlueprintGhostLines
            widths={["w-full", "w-full", "w-3/5"]}
            className="text-[12.5px] leading-relaxed"
          />
        </div>
        <div className="mb-3.5 flex flex-wrap gap-1.5">
          <BlueprintFill className="h-[21.75px] w-16 rounded-[5px]" />
          <BlueprintFill className="h-[21.75px] w-14 rounded-[5px]" />
          <BlueprintFill className="h-[21.75px] w-12 rounded-[5px]" />
        </div>
        <div className="flex flex-col gap-2 border-t border-blueprint/15 pt-3">
          <BlueprintStatRow label="Stars" value="1,234 (1.2k)" />
          <BlueprintStatRow label="Forks" value="123" />
          <BlueprintStatRow label="Open issues" value="45" />
          <BlueprintStatRow label="Contributors" value="67" />
          <BlueprintStatRow label="License" value="MIT" />
        </div>
        <div className="mt-3 flex flex-col gap-1.5 border-t border-blueprint/15 pt-3 text-[11.5px]">
          <span className="inline-flex items-center gap-1.5">
            <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
            <BlueprintGhostText text="Created 3 months ago" />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-[3px]" />
            <BlueprintGhostText text="Updated 2 days ago" />
          </span>
        </div>
      </BlueprintRailCard>

      <BlueprintMaintainerCard />

      <BlueprintRailCard>
        <BlueprintRailHeading text="CLONE" icon />
        <BlueprintCopyBox text="git clone https://github.com/owner/repo.git" />
      </BlueprintRailCard>

      <BlueprintRailCard>
        <BlueprintRailHeading text="SHARE" icon />
        <BlueprintCopyBox text="https://devtunnel.dev/github-projects/project-name" />
      </BlueprintRailCard>
    </aside>
  );
}

/**
 * The right-hand rail of `/submissions/:slug` (`SubmissionDetailSidebar`):
 * Submitted by (36px avatar, name + mono handle, then the two-line
 * "Submitted … Not reviewed or curated" note under a rule), the AI summary
 * as a stand-alone card, Repository (four stat rows, created / last push)
 * and Share.
 */
export function BlueprintSubmissionSidebar() {
  return (
    <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0" aria-hidden="true">
      <BlueprintRailCard>
        <BlueprintRailHeading text="SUBMITTED BY" />
        <div className="flex items-center gap-2.5">
          <BlueprintFill className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0">
            <div className="text-[13px] font-medium">
              <BlueprintGhostText text="Submitter name" />
            </div>
            <div className="font-mono text-[11px]">
              <BlueprintGhostText text="@submitter" />
            </div>
          </div>
        </div>
        <div className="mt-3 border-t border-blueprint/15 pt-3">
          <BlueprintGhostParagraph
            className="text-[11.5px]"
            text="Submitted 3 days ago. Not reviewed or curated by DevTunnel."
          />
        </div>
      </BlueprintRailCard>

      <BlueprintRailCard>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-[11px] tracking-wide">
            <BlueprintFill className="h-3.5 w-3.5 rounded-[3px]" />
            <BlueprintGhostText text="SUMMARY" />
          </div>
        </div>
        <div className="mb-3 flex items-center gap-2 text-[12px]">
          <BlueprintFill className="h-[13px] w-[13px] shrink-0 rounded-full" />
          <BlueprintGhostText text="Generating summary…" />
        </div>
        <div className="flex flex-col gap-2">
          <BlueprintFill className="h-3 w-full" />
          <BlueprintFill className="h-3 w-full" />
          <BlueprintFill className="h-3 w-2/3" />
        </div>
      </BlueprintRailCard>

      <BlueprintRailCard>
        <BlueprintRailHeading text="REPOSITORY" />
        <div className="flex flex-col gap-2">
          <BlueprintStatRow label="Stars" value="1,234 (1.2k)" />
          <BlueprintStatRow label="Forks" value="123" />
          <BlueprintStatRow label="Open issues" value="45" />
          <div className="flex items-center justify-between gap-3 text-[12px]">
            <BlueprintGhostText text="License" />
            <BlueprintGhostText text="MIT" />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1 border-t border-blueprint/15 pt-3 text-[11.5px]">
          <BlueprintGhostText text="Created 3 months ago" className="w-fit" />
          <BlueprintGhostText text="Last push 2 days ago" className="w-fit" />
        </div>
      </BlueprintRailCard>

      <BlueprintRailCard>
        <BlueprintRailHeading text="SHARE" />
        <BlueprintCopyBox text="https://devtunnel.dev/submissions/submission-name" />
      </BlueprintRailCard>
    </aside>
  );
}

/**
 * The main column of `/submissions/:slug` — three `p-5` cards, `gap-4`
 * apart: About (a "From GitHub" 11px label over the 13px
 * `leading-relaxed` description), Details (the 140px / 1fr grid with its
 * five rows — Type, Primary language, Alternative to, Upvotes, Source —
 * and the tech-stack block) and README (rendered Markdown, drawn as text
 * lines).
 */
export function BlueprintSubmissionSections() {
  const rows: [string, string][] = [
    ["Type", "Project"],
    ["Primary language", "TypeScript"],
    ["Alternative to", "Not listed as an alternative to paid software"],
    ["Upvotes", "12 in total · 3 in the last 7 days"],
    ["Source", "https://github.com/owner/repository-name"],
  ];
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4" aria-hidden="true">
      <BlueprintTaskSection>
        <BlueprintTaskHeading text="About" />
        <div className="mb-1 text-[11px]">
          <BlueprintGhostText text="From GitHub" />
        </div>
        <BlueprintGhostParagraph
          className="text-[13px] leading-relaxed"
          text="A short description of the repository as it appears on GitHub, which tells a visitor what the project does and who it is for."
        />
      </BlueprintTaskSection>

      <BlueprintTaskSection>
        <BlueprintTaskHeading text="Details" />
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-[140px_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <BlueprintGhostText text={label} className="w-fit" />
              <BlueprintGhostText text={value} className="w-fit" />
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-blueprint/15 pt-4">
          <div className="mb-2 text-[11px] uppercase tracking-wide">
            <BlueprintGhostText text="Tech stack" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["w-16", "w-14", "w-[72px]", "w-12"].map((width, index) => (
              <BlueprintFill key={index} className={`h-[21.75px] ${width} rounded-[5px]`} />
            ))}
          </div>
        </div>
      </BlueprintTaskSection>

      <BlueprintTaskSection>
        <BlueprintTaskHeading text="README" />
        <div className="flex flex-col gap-2">
          {["w-1/3", "w-full", "w-full", "w-5/6", "w-1/4", "w-full", "w-full", "w-2/3"].map(
            (width, index) => (
              <BlueprintFill key={index} className={`h-3 ${width}`} />
            ),
          )}
        </div>
      </BlueprintTaskSection>
    </div>
  );
}
