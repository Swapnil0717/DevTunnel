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
import { BlueprintClock } from "@/components/ui/blueprint-reveal";

/**
 * Every offset below is `delayMs` minus `--bp-elapsed` (globals.css /
 * blueprint-reveal.tsx): inside a `BlueprintReveal` overlay the variable
 * holds how long the loading sheet was already visible, so the overlay's
 * copy resumes mid-drawing instead of starting over. Everywhere else the
 * variable is unset and this is just `delayMs`.
 */
const withElapsed = (delayMs: number) => `calc(${delayMs}ms - var(--bp-elapsed, 0ms))`;

export function BlueprintSheet({
  sheetLabel,
  revLabel,
  contentClassName = "mx-auto w-full max-w-[1040px] px-4 pb-10 pt-6 sm:px-7",
  ariaHidden = true,
  children,
}: {
  /** Top-left label, e.g. "SHEET 01 — HOME". */
  sheetLabel: string;
  /** Top-right label, e.g. "REV — loading your workspace". */
  revLabel: string;
  /**
   * Classes for the column the blocks sit in. Pass the same width and
   * padding the route's real `<main>` uses (e.g. `mx-auto w-full
   * max-w-6xl px-6 py-10`) so every placeholder lands exactly where the
   * real content will — the ruler and labels are absolutely positioned
   * over the sheet's margin and don't push the content down.
   */
  contentClassName?: string;
  /** Pass `false` only when the sheet carries a real status message a screen reader should announce (the `/issues` live-scan notice). */
  ariaHidden?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="blueprint-sheet relative min-h-screen w-full overflow-hidden" aria-hidden={ariaHidden ? "true" : undefined}>
      <BlueprintClock />
      {/* Own element, own fixed height — see the comment on
          `.blueprint-ruler-strip` in globals.css for why this can't just
          be another class on the grid div above. */}
      <div className="blueprint-ruler-strip absolute inset-x-0 top-0 h-[7px]" />
      <div className="absolute inset-x-0 top-[7px] flex items-center justify-between px-4 py-1.5 text-[10px] uppercase tracking-wide text-white/70 sm:px-6">
        <span>{sheetLabel}</span>
        <span className="text-right">{revLabel}</span>
      </div>
      <div className={`blueprint-sheet-content ${contentClassName}`}>{children}</div>
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
    <div style={{ animationDelay: withElapsed(delayMs) }} className={`blueprint-block ${className}`}>
      <div className={`blueprint-hatch h-full w-full ${rounded}`} />
      {dimension ? (
        <div className="mt-1 flex items-center gap-1.5">
          <span
            style={{ animationDelay: withElapsed(delayMs + 250) }}
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
      style={{ animationDelay: withElapsed(delayMs) }}
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
