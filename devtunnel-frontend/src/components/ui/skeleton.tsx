/**
 * Shared skeleton building blocks for route-level `loading.tsx` files.
 *
 * `SkeletonBlock` is the one primitive that actually renders the
 * shimmer effect (a translucent band sweeping left-to-right via the
 * `shimmer` keyframes in tailwind.config.ts); every other helper below
 * composes `SkeletonBlock` rather than drawing its own `bg-surface`
 * div, so the animation only needs to change in one place.
 */

 export function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-surface ${className}`} aria-hidden="true">
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

/** A row of N stat-card placeholders, matching `AdminStatCard`'s shape. */
export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
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
 * A page heading + description + N action-button placeholders, matching
 * the `<div className="mb-8 flex ... justify-between">
 *   <div><h1/><p/></div>
 *   {actions}
 * </div>` header markup shared by every admin list page (Projects,
 * Tasks, Open Source Tools, Activity, the AI queue pages, ...). Always
 * renders the description line — every one of those pages has a
 * one-line subtitle under the `h1`, so a header skeleton missing it
 * collapses to a shorter box than what actually replaces it.
 */
export function SkeletonPageHeader({ actions = 1 }: { actions?: number }) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4" aria-hidden="true">
      <div className="flex flex-col gap-2">
        <SkeletonBlock className="h-6 w-40" />
        <SkeletonBlock className="h-3.5 w-72 max-w-full" />
      </div>
      {actions > 0 ? (
        <div className="flex flex-wrap items-start gap-3">
          {Array.from({ length: actions }).map((_, index) => (
            <SkeletonBlock key={index} className="h-9 w-28" />
          ))}
        </div>
      ) : null}
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