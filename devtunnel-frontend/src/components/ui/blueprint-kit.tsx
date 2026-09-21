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
 * card, this draws a faint white-tinted panel with a hairline outline;
 * where it draws a shimmering bar, this draws a diagonally hatched
 * bar that is "drawn" in from its top edge (`.blueprint-fill`,
 * globals.css). Compose them inside `<BlueprintSheet>`, never directly
 * on the app's normal light/dark background — the hatch is white and
 * would be invisible there. Inline, already-rendered UI (the Home
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
        <div key={index} className="rounded-[10px] border border-white/25 bg-white/[0.05] px-4 py-3.5">
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
      <div className="flex flex-col gap-1.5">
        <BlueprintFill className="h-5 w-44" />
        <BlueprintFill className="h-3 w-72" />
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
      <span className="blueprint-leader h-px flex-1 border-t border-dotted border-white/50" />
      <span className="shrink-0 rounded-[2px] border border-white/40 bg-white/10 px-1 py-px text-[9px] leading-tight text-white/80">
        {label}
      </span>
      <span className="blueprint-leader h-px flex-1 border-t border-dotted border-white/50" />
    </div>
  );
}

/** A bordered table-shaped placeholder: header bar + N row placeholders, dimensioned along its bottom edge. */
export function BlueprintTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div aria-hidden="true">
      <div className="overflow-hidden rounded-[4px] border border-white/25">
        <div className="flex gap-4 border-b border-white/25 bg-white/[0.05] px-4 py-2.5">
          {Array.from({ length: columns }).map((_, index) => (
            <BlueprintFill key={index} className="h-2.5 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={rowIndex}
            className="flex items-center gap-4 border-b border-white/25 px-4 py-3 last:border-b-0"
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <BlueprintFill key={colIndex} className="h-3 flex-1" />
            ))}
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
 * bar every admin Explorer renders above its table/grid
 * (`AdminProjectsExplorer`, `AdminTasksExplorer`,
 * `AdminOpenSourceToolsExplorer`, `AdminActivityExplorer`) — previously
 * missing from every one of those `loading.tsx` files, so the table/grid
 * used to jump down the page the moment real data replaced the skeleton.
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
 * Filter bar + N review-card placeholders, matching `AiDiscoveryQueue`'s
 * rendered list (title link, subtitle line, meta chips, Confirm/Reject
 * buttons) — replaces `BlueprintTable`, which this queue never actually
 * renders as (it's a card list, not a table).
 */
export function BlueprintQueueList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-white/15 bg-white/[0.03] p-3">
        <BlueprintFill className="h-9 w-full sm:w-64" />
        <BlueprintFill className="h-9 w-32" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-lg border border-white/25 p-4">
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
          className="flex flex-col items-center rounded-[10px] border border-white/25 bg-white/[0.05] p-4"
        >
          <BlueprintFill className="h-[88px] w-[88px] rounded-[12px]" />
          <BlueprintFill className="mt-2.5 h-3.5 w-24" />
          <BlueprintFill className="mt-1.5 h-2.5 w-32" />
          <BlueprintFill className="mt-1.5 h-2.5 w-14 rounded-full" />
          <div className="mt-3 flex w-full items-center justify-center gap-2 border-t border-white/15 pt-2.5">
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
          className="flex flex-col rounded-[10px] border border-white/25 bg-white/[0.05] p-4"
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
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/15 pt-2.5">
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
 * grid: a left-aligned square-logo + name/subtitle row, a two-line
 * description, a single tech-stack tag, then a bordered match-badge +
 * "View project" footer row — the `/projects` counterpart to
 * `BlueprintGithubProjectCardGrid` above, sized for
 * `DevtunnelProjectCard`'s own shape (one tag, no stars/forks/issues
 * row) rather than reused as-is, same "match the real card's own
 * internal shape" approach that helper documents.
 */
 export function BlueprintDevtunnelProjectCardGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col rounded-[10px] border border-white/25 bg-white/[0.05] p-4"
        >
          <div className="mb-2.5 flex items-start gap-2.5">
            <BlueprintFill className="h-8 w-8 shrink-0 rounded-[10px]" />
            <div className="flex-1">
              <BlueprintFill className="h-3 w-28" />
              <BlueprintFill className="mt-1.5 h-2.5 w-24" />
            </div>
          </div>
          <BlueprintFill className="mb-1.5 h-2.5 w-full" />
          <BlueprintFill className="mb-3 h-2.5 w-3/5" />
          <div className="mb-3 flex gap-1.5">
            <BlueprintFill className="h-4 w-14 rounded-full" />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/15 pt-2.5">
            <BlueprintFill className="h-3 w-24" />
            <BlueprintFill className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
/**
 * N `DevtunnelOpenSourceToolCard`-shaped placeholders for
 * `/opensource-tools`'s card grid — same left-aligned logo + name/source
 * row, two-line description, tag row, and bordered footer shape as
 * `BlueprintGithubProjectCardGrid` above (this card was deliberately
 * styled to match `GithubProjectCard`), kept as its own export so this
 * page's `loading.tsx` isn't coupled to a name that documents a
 * different route.
 */
 export function BlueprintDevtunnelOpenSourceToolCardGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col rounded-[10px] border border-white/25 bg-white/[0.05] p-4"
        >
          <div className="mb-2.5 flex items-start gap-2.5">
            <BlueprintFill className="h-8 w-8 shrink-0 rounded-[10px]" />
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
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-white/15 pt-2.5">
            <BlueprintFill className="h-3 w-16" />
            <BlueprintFill className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}