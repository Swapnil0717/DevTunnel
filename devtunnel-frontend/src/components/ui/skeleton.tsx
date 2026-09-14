// src/components/ui/skeleton.tsx
/**
 * Shared skeleton building blocks for route-level `loading.tsx` files.
 *
 * `SkeletonBlock` is the one primitive that actually renders the
 * shimmer effect (a translucent band sweeping left-to-right via the
 * `shimmer` keyframes in tailwind.config.ts); every other helper below
 * composes `SkeletonBlock` rather than drawing its own `bg-surface`
 * div, so the animation only needs to change in one place.
 */

 import type { ReactNode } from "react";

 export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-surface ${className}`} aria-hidden="true">
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
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
export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  const gridColsClass = STAT_CARD_GRID_COLS[count] ?? STAT_CARD_GRID_COLS[4];
  return (
    <div className={`grid grid-cols-2 gap-3 ${gridColsClass}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-[10px] border border-border bg-surface px-4 py-3.5">
          <SkeletonBlock className="mb-2 h-2.5 w-16" />
          <SkeletonBlock className="h-5 w-10" />
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
export function SkeletonPageHeader({
  withAction = true,
  actions,
}: {
  withAction?: boolean;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4" aria-hidden="true">
      <div className="flex flex-col gap-1.5">
        <SkeletonBlock className="h-5 w-44" />
        <SkeletonBlock className="h-3 w-72" />
      </div>
      {actions ?? (withAction ? <SkeletonBlock className="h-9 w-36" /> : null)}
    </div>
  );
}

/** A bordered table-shaped skeleton: header bar + N row placeholders. */
export function SkeletonTable({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border" aria-hidden="true">
      <div className="flex gap-4 border-b border-border bg-surface px-4 py-2.5">
        {Array.from({ length: columns }).map((_, index) => (
          <SkeletonBlock key={index} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0"
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <SkeletonBlock key={colIndex} className="h-3 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A handful of skeleton text lines, e.g. for a detail page's body copy. */
export function SkeletonLines({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <SkeletonBlock key={index} className={`h-3 ${index === count - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}

/** Circular avatar + a couple of text-line placeholders, for profile-style headers. */
export function SkeletonAvatarHeader() {
  return (
    <div className="mb-5 flex items-center gap-4" aria-hidden="true">
      <SkeletonBlock className="h-16 w-16 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <SkeletonBlock className="h-4 w-40" />
        <SkeletonBlock className="h-3 w-24" />
      </div>
    </div>
  );
}

/**
 * "Back to X" link + breadcrumb nav + title/meta row + action-button
 * row, matching the shared header on
 * `/admin/{projects,tasks,opensource-tools}/[id]` — none of which use a
 * circular avatar (that's profile-only), so this is the detail-page
 * counterpart to `SkeletonAvatarHeader`. Pass `withLogo` for the tool
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
export function SkeletonDetailHeader({
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
      <SkeletonBlock className="mb-4 h-3 w-32" />
      <SkeletonBlock className="mb-6 h-3 w-40" />
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className={withLogo ? "flex items-start gap-4" : "flex flex-col gap-2.5"}>
          {withLogo ? <SkeletonBlock className="h-14 w-14 shrink-0 rounded-[12px]" /> : null}
          <div className="flex flex-col gap-2.5">
            <SkeletonBlock className="h-5 w-52" />
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              {meta ?? <SkeletonBlock className="h-3 w-64" />}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions ?? (
            <>
              <SkeletonBlock className="h-9 w-28" />
              <SkeletonBlock className="h-9 w-24" />
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
export function SkeletonFilterBar({ filters = 2 }: { filters?: number }) {
  return (
    <div
      className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between"
      aria-hidden="true"
    >
      <SkeletonBlock className="h-9 w-full sm:max-w-xs" />
      <div className="flex flex-wrap items-end gap-3">
        {Array.from({ length: filters }).map((_, index) => (
          <div key={index} className="flex flex-col gap-1">
            <SkeletonBlock className="h-2 w-12" />
            <SkeletonBlock className="h-9 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Filter bar + N review-card placeholders, matching `AiDiscoveryQueue`'s
 * rendered list (title link, subtitle line, meta chips, Confirm/Reject
 * buttons) — replaces `SkeletonTable`, which this queue never actually
 * renders as (it's a card list, not a table).
 */
export function SkeletonQueueList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border-subtle bg-surface/40 p-3">
        <SkeletonBlock className="h-9 w-full sm:w-64" />
        <SkeletonBlock className="h-9 w-32" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <SkeletonBlock className="h-3.5 w-2/5" />
              <SkeletonBlock className="mt-2 h-3 w-3/5" />
              <SkeletonBlock className="mt-2 h-2.5 w-1/3" />
            </div>
            <div className="flex shrink-0 gap-2">
              <SkeletonBlock className="h-7 w-[74px]" />
              <SkeletonBlock className="h-7 w-[64px]" />
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
export function SkeletonToolCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col items-center rounded-[10px] border border-border bg-surface p-4"
        >
          <SkeletonBlock className="h-[88px] w-[88px] rounded-[12px]" />
          <SkeletonBlock className="mt-2.5 h-3.5 w-24" />
          <SkeletonBlock className="mt-1.5 h-2.5 w-32" />
          <SkeletonBlock className="mt-1.5 h-2.5 w-14 rounded-full" />
          <div className="mt-3 flex w-full items-center justify-center gap-2 border-t border-border-subtle pt-2.5">
            <SkeletonBlock className="h-5 w-10" />
            <SkeletonBlock className="h-5 w-10" />
            <SkeletonBlock className="h-5 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}