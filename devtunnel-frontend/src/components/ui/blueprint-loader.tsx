// src/components/ui/blueprint-loader.tsx
/**
 * "Blueprint" loading sheet — reproduces the recent.design "portfolio
 * page load animation" reference (https://recent.design/i/59f09u6) as-is:
 * a full-bleed CAD/architectural drawing sheet — ruled grid, diagonally
 * hatched placeholder blocks, dimension callouts with dotted leader
 * lines, and "PLATE" corner flags — that draws itself in top to bottom
 * ahead of the real page.
 *
 * Three pieces, composed by a route's `loading.tsx`:
 *
 *  - `BlueprintSheet` — the full-viewport backdrop: grid background,
 *    top ruler, and the "SHEET / REV" corner labels from the reference.
 *  - `BlueprintBlock` — one hatched placeholder rectangle. Pass
 *    `dimension` on the wider ones (paragraph-shaped content) to also
 *    draw the small numbered callout + dotted leader the reference uses
 *    on its longer blocks — the shorter ones (avatar, title) skip it,
 *    same as the reference.
 *  - `BlueprintPlate` — a bottom-row card placeholder with the
 *    reference's folded-corner "PLATE 01/02/03" flag.
 *
 * `delayMs` staggers the top-to-bottom build; pass increasing values in
 * reading order the way the reference's blocks appear one after another
 * rather than all at once (same convention as `SkeletonBlock`'s
 * `delayMs` in skeleton.tsx, just explicit here since these compose
 * across rows/grids rather than always being direct siblings).
 */

import type { ReactNode } from "react";

export function BlueprintSheet({
  sheetLabel,
  revLabel,
  children,
}: {
  /** Top-left label, e.g. "SHEET 01 — HOME". */
  sheetLabel: string;
  /** Top-right label, e.g. "REV — loading your workspace". */
  revLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="blueprint-sheet relative min-h-screen w-full overflow-hidden" aria-hidden="true">
      {/* Own element, own fixed height — see the comment on
          `.blueprint-ruler-strip` in globals.css for why this can't just
          be another class on the grid div above. */}
      <div className="blueprint-ruler-strip h-[7px] w-full" />
      <div className="flex items-center justify-between px-4 py-2 text-[10px] uppercase tracking-wide text-white/70 sm:px-6">
        <span>{sheetLabel}</span>
        <span className="text-right">{revLabel}</span>
      </div>
      <div className="mx-auto w-full max-w-[1040px] px-4 pb-10 pt-6 sm:px-7">{children}</div>
    </div>
  );
}

export function BlueprintBlock({
  className = "",
  dimension,
  delayMs = 0,
  rounded = "rounded-[2px]",
}: {
  className?: string;
  /** Small numeric callout drawn under the block with a dotted leader, e.g. "444". Omit for short/title-sized blocks. */
  dimension?: string;
  delayMs?: number;
  /** Corner radius of the hatch fill itself — pass `"rounded-full"` for avatar-shaped blocks. */
  rounded?: string;
}) {
  return (
    <div style={{ animationDelay: `${delayMs}ms` }} className={`blueprint-block ${className}`}>
      <div className={`blueprint-hatch h-full w-full ${rounded}`} />
      {dimension ? (
        <div className="mt-1 flex items-center gap-1.5">
          <span
            style={{ animationDelay: `${delayMs + 250}ms` }}
            className="blueprint-leader h-px w-10 flex-1 max-w-[64px] border-t border-dotted border-white/50"
          />
          <span className="shrink-0 rounded-[2px] border border-white/40 bg-white/10 px-1 py-px text-[9px] leading-tight text-white/80">
            {dimension}
          </span>
        </div>
      ) : null}
    </div>
  );
}

export function BlueprintPlate({ label, delayMs = 0 }: { label: string; delayMs?: number }) {
  return (
    <div
      style={{ animationDelay: `${delayMs}ms` }}
      className="blueprint-plate relative aspect-[4/3] overflow-hidden rounded-[2px] border border-white/40 bg-white/[0.06]"
    >
      <span className="absolute left-1.5 top-1.5 z-10 rounded-[2px] border border-white/40 bg-white/15 px-1 py-px text-[9px] uppercase leading-tight text-white/85">
        {label}
      </span>
      {/* The reference draws each empty plate as a box with a corner-to-corner X — a
          standard CAD "placeholder/void" mark — rather than a hatch fill. */}
      <svg
        viewBox="0 0 100 75"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full text-white/25"
      >
        <line x1="0" y1="0" x2="100" y2="75" stroke="currentColor" strokeWidth="0.6" />
        <line x1="100" y1="0" x2="0" y2="75" stroke="currentColor" strokeWidth="0.6" />
      </svg>
    </div>
  );
}
