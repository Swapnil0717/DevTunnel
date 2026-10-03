// devtunnel-frontend/src/components/sponsors/sponsor-goal-bar.tsx
import type { CSSProperties } from "react";
import { SPONSOR_GOAL_HEADING, formatInr } from "@/lib/sponsors/sponsors";
import type { SponsorsResponse } from "@/lib/sponsors/api";

/**
 * Monthly goal bar. The numbers come from `GET /sponsors` (passed in by the
 * page), so an empty bar is the real state, not a placeholder.
 *
 * Progress is stated in words ("Rs X of Rs Y this month" and the percent),
 * never by color alone (rule 43), and exposed as a `progressbar`.
 *
 * `goal.percent` is NOT capped by the backend (130 means the goal was
 * beaten): the number in the text stays honest, only the bar is clamped.
 *
 * Motion: the fill grows from 0 once on load (`.sponsor-goal-fill` in
 * globals.css). With `prefers-reduced-motion` there is no animation and the
 * bar just renders at its final width.
 *
 * No layout shift: every row has a fixed line height and a single line, and
 * the bar sits in a fixed-height track, so the card is the same height with
 * 0 raised, a full bar, or a beaten goal. `loading.tsx` reserves the same
 * heights (keep the two in step: row 20px, track 6px, caption 16px).
 */
export function SponsorGoalBar({ goal }: { goal: SponsorsResponse["goal"] }) {
  const raised = Math.max(0, goal.raisedInr);
  const barPercent = Math.min(100, Math.max(0, goal.percent));
  const reached = goal.percent >= 100;

  return (
    <section
      aria-labelledby="sponsor-goal-heading"
      className="mb-6 rounded-[10px] border border-border bg-surface px-4 py-3.5"
    >
      <div className="flex h-5 items-center justify-between gap-3">
        <h2
          id="sponsor-goal-heading"
          className="m-0 min-w-0 truncate text-xs font-normal text-text-muted"
        >
          {SPONSOR_GOAL_HEADING}
        </h2>
        <p className="m-0 shrink-0 text-[13px] font-medium tabular-nums text-text">{goal.percent}%</p>
      </div>

      <div
        role="progressbar"
        aria-labelledby="sponsor-goal-heading"
        aria-valuemin={0}
        aria-valuemax={goal.goalInr}
        aria-valuenow={Math.min(raised, goal.goalInr)}
        aria-valuetext={`${formatInr(raised)} of ${formatInr(goal.goalInr)} this month`}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div
          className="sponsor-goal-fill h-full rounded-full bg-accent"
          style={
            {
              width: `${barPercent}%`,
              "--goal-pct": `${barPercent}%`,
            } as CSSProperties
          }
        />
      </div>

      <p className="m-0 mt-2 truncate text-xs leading-4 text-text-secondary">
        <span className="font-medium tabular-nums text-text">{formatInr(raised)}</span> of{" "}
        <span className="tabular-nums">{formatInr(goal.goalInr)}</span> this month
        {reached ? <span className="text-status-success-label"> · Goal reached</span> : null}
      </p>
    </section>
  );
}
