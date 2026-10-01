import type { ReactNode } from "react";
import { SkeletonBlock } from "@/components/ui/skeleton";
import { BlueprintBlock } from "@/components/ui/blueprint-loader";
import { HOME_LIST, HOME_PANEL } from "./styles";

/**
 * Shared building blocks for every Home loading placeholder.
 *
 * Home has two loading states, and they have to look like the page they
 * stand in for, so both are built from the SAME components here:
 *
 *  - `"page"` — the in-page `<Suspense>` fallbacks (shimmering `SkeletonBlock`s
 *    on the real panel colours), shown while a section's data streams in.
 *  - `"blueprint"` — the route-level drawing sheet (`home/loading.tsx` and the
 *    `BlueprintReveal` cover that replays it over the page), where the same
 *    layout is drawn in hatched `BlueprintBlock`s on the blueprint grid.
 *
 * Only the *paint* differs between the two tones; every box, gap, padding and
 * line height is shared. That is what makes the skeleton line up with the real
 * Home page, and it means a change to a real component's geometry is made in
 * one skeleton file, not two.
 *
 * Geometry rule: a text line in the real page is as tall as its line box, not
 * as tall as its glyphs. Tailwind's preflight sets `line-height: 1.5` on
 * `<html>`, so a `text-[12.5px]` line is 18.75px tall, a `text-[13px]
 * leading-[1.6]` line is 20.8px, and so on. A skeleton bar is therefore drawn
 * *inside* a `SkeletonLine` of the real line-box height (`lineHeightPx`), so
 * every row ends up exactly as tall as the text it stands in for — the bars
 * themselves stay a little shorter than the line, like glyphs would.
 */

export type HomeSkeletonTone = "page" | "blueprint";

export type HomeSkeletonProps = {
  /** Paint: in-page shimmer (default) or the blueprint drawing sheet. */
  tone?: HomeSkeletonTone;
  /**
   * Build-in start time (ms) for this block of the page. Blueprint sheets
   * draw top to bottom, so `HomePageSkeleton` hands each section a later base.
   */
  baseDelay?: number;
};

/** Height of one text line: font size × the line-height multiplier the real element uses (Tailwind's default is 1.5). */
export function lineHeightPx(fontPx: number, leading = 1.5): number {
  return fontPx * leading;
}

/**
 * Per-tone paint. `page` values are the real Home surfaces (`styles.ts`);
 * `blueprint` values are the same shapes outlined in the sheet's ink colour
 * with no fill, so the grid shows through.
 */
export const HOME_SKELETON_SURFACE: Record<
  HomeSkeletonTone,
  {
    /** `HOME_PANEL` — journey card, stat strip, project card, activity list. */
    panel: string;
    /** `HOME_LIST` — a panel of hairline-divided rows. */
    list: string;
    /** Border colour for a panel's inner divider (`border-t`, `border-l`). */
    rule: string;
    /** Border colour for the quieter divider inside a project card. */
    ruleSoft: string;
    /** Background of a hairline (stepper connector, timeline line). */
    hairline: string;
    /** A hollow timeline dot. */
    dot: string;
    /** The filled "most recent" timeline dot. */
    dotActive: string;
  }
> = {
  page: {
    panel: HOME_PANEL,
    list: HOME_LIST,
    rule: "border-[#1F1F1F]",
    ruleSoft: "border-[#1A1A1A]",
    hairline: "bg-border",
    dot: "border border-[#3A3A3A] bg-[#0E0E0E]",
    dotActive: "border-2 border-[#0E0E0E] bg-accent",
  },
  blueprint: {
    panel: "rounded-[10px] border border-blueprint/25",
    list: "overflow-hidden rounded-[10px] border border-blueprint/25 divide-y divide-blueprint/20",
    rule: "border-blueprint/25",
    ruleSoft: "border-blueprint/20",
    hairline: "bg-blueprint/25",
    dot: "border border-blueprint/45 bg-blueprint/10",
    dotActive: "border border-blueprint/70 bg-blueprint/50",
  },
};

/**
 * One placeholder bar, painted for the tone. `rounded` is a full radius class
 * (`"rounded-full"`, `"rounded-[7px]"`); omit it for the tone's default
 * (rounded-lg shimmer / 2px blueprint hatch). Use arbitrary-value radii
 * (`rounded-[6px]`) rather than `rounded-md` — `SkeletonBlock` already carries
 * `rounded-lg`, and Tailwind emits `rounded-md` *before* it, so it would lose.
 */
export function HomeSkeletonBlock({
  tone = "page",
  className = "",
  delayMs = 0,
  rounded,
}: {
  tone?: HomeSkeletonTone;
  className?: string;
  delayMs?: number;
  rounded?: string;
}) {
  if (tone === "blueprint") {
    return <BlueprintBlock className={className} delayMs={delayMs} rounded={rounded} />;
  }
  return <SkeletonBlock className={`${rounded ?? ""} ${className}`} delayMs={delayMs} />;
}

/**
 * A fixed-height line box that vertically centres its bar — the stand-in for
 * one line of text. `height` is the real line's height in px
 * (`lineHeightPx(...)`); `className` takes layout classes (`mb-3`, `pr-2`,
 * `sm:justify-end`).
 */
export function SkeletonLine({
  height,
  className = "",
  children,
}: {
  height: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex items-center ${className}`} style={{ height }}>
      {children}
    </div>
  );
}

/**
 * Same offset `BlueprintBlock` applies to its own delay: inside a
 * `BlueprintReveal` cover the sheet resumes mid-drawing instead of restarting.
 * Only for hand-rolled blueprint-only elements (the PLATE flags).
 */
export function elapsedDelay(delayMs: number): string {
  return `calc(${delayMs}ms - var(--bp-elapsed, 0ms))`;
}
