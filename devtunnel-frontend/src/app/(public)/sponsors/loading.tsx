import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintFill,
  BlueprintGhostLines,
  BlueprintGhostParagraph,
  BlueprintGhostText,
} from "@/components/ui/blueprint-kit";
import {
  SPONSOR_BUTTON_NOTE,
  SPONSOR_GOAL_HEADING,
  SPONSOR_TIERS_CAPTION,
  SPONSORS_PAGE_INTRO,
  SPONSORS_PAGE_TITLE,
} from "@/lib/sponsors/sponsors";

/**
 * Route-segment loading boundary for `/sponsors`.
 *
 * `/sponsors` is ISR with a 5-minute cache, so this is mostly seen on a cold
 * regeneration or a slow API; it mirrors the real page block for block so
 * nothing moves when the page replaces it:
 *  - title + intro: the real copy (shared constants), ghosted, so the intro
 *    wraps onto the same number of lines;
 *  - `SponsorGoalBar`: same card, same fixed rows (20px heading row, 6px
 *    track, 16px caption) with the real heading ghosted;
 *  - `SponsorTiers`: caption line + three tier cards (`sm:grid-cols-3`);
 *  - the Razorpay button + its note (`mb-6`);
 *  - `SponsorWall`: `border-t pt-4`, heading, then the empty "Be the first
 *    sponsor" card's height as the stand-in for the list.
 */
export default function SponsorsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 12 — Sponsors"
      revLabel="Rev — loading sponsors"
      contentClassName="mx-auto max-w-3xl px-6 py-10"
    >
      {/* h1 (mb-1.5, text-xl = 28px line) + intro (mb-5, 13px / relaxed, max-w-xl) */}
      <div className="m-0 mb-1.5 text-xl font-medium" aria-hidden="true">
        <BlueprintGhostText text={SPONSORS_PAGE_TITLE} />
      </div>
      <BlueprintGhostParagraph
        text={SPONSORS_PAGE_INTRO}
        className="mb-5 max-w-xl text-[13px] leading-relaxed"
      />

      {/* SponsorGoalBar */}
      <div
        className="mb-6 rounded-[10px] border border-border bg-surface/10 px-4 py-3.5"
        aria-hidden="true"
      >
        <div className="flex h-5 items-center justify-between gap-3">
          <span className="min-w-0 truncate text-xs">
            <BlueprintGhostText text={SPONSOR_GOAL_HEADING} />
          </span>
          <BlueprintFill className="h-3.5 w-9 shrink-0" />
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full">
          <BlueprintFill className="h-full w-full rounded-full" />
        </div>
        <div className="mt-2 flex h-4 items-center">
          <BlueprintFill className="h-3 w-44" />
        </div>
      </div>

      {/* SponsorTiers: caption (mb-2) + 3 cards (p-3: 13px + 15px + 11.5px lines) */}
      <div className="mb-4" aria-hidden="true">
        <div className="mb-2 text-[11.5px] leading-normal">
          <BlueprintGhostText text={SPONSOR_TIERS_CAPTION} />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div key={index} className="rounded-[10px] border border-border bg-surface/10 p-3">
              <BlueprintGhostLines widths={["w-20"]} className="text-[13px] leading-normal" />
              <BlueprintGhostLines widths={["w-28"]} className="my-0.5 text-[15px] leading-normal" />
              <BlueprintGhostLines widths={["w-36"]} className="text-[11.5px] leading-[1.45]" />
            </div>
          ))}
        </div>
      </div>

      {/* Razorpay button (py-2 + 13px text) and its note (mt-1.5, 11.5px) */}
      <div className="mb-6" aria-hidden="true">
        <BlueprintFill className="h-[35.5px] w-48 rounded-md" />
        <BlueprintGhostParagraph text={SPONSOR_BUTTON_NOTE} className="mt-1.5 text-[11.5px]" />
      </div>

      {/* SponsorWall */}
      <div className="border-t border-border-subtle pt-4" aria-hidden="true">
        <div className="mb-2 text-sm font-medium leading-normal">
          <BlueprintGhostText text="Our sponsors" />
        </div>
        <BlueprintFill className="h-[108px] w-full rounded-[10px]" />
      </div>
    </BlueprintSheet>
  );
}
