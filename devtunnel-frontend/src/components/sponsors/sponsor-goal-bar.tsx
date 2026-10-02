// devtunnel-frontend/src/components/sponsors/sponsor-goal-bar.tsx
import { MONTHLY_GOAL_INR, RAISED_THIS_MONTH_INR, formatInr } from "@/lib/sponsors/sponsors";

/**
 * Monthly goal bar. The numbers come from `lib/sponsors/sponsors.ts`, so an
 * empty bar at launch is the real state, not a placeholder. Progress is
 * stated in words next to the bar (rule 43 — never color alone) and exposed
 * as a `progressbar` for assistive tech.
 */
export function SponsorGoalBar() {
  const raised = Math.max(0, RAISED_THIS_MONTH_INR);
  const percent = MONTHLY_GOAL_INR > 0 ? Math.min(100, Math.round((raised / MONTHLY_GOAL_INR) * 100)) : 0;

  return (
    <section
      aria-labelledby="sponsor-goal-heading"
      className="mb-6 rounded-[10px] border border-border bg-surface px-4 py-3.5"
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
        <h2 id="sponsor-goal-heading" className="m-0 text-xs font-normal text-text-muted">
          Monthly goal: hosting and AI costs
        </h2>
        <p className="m-0 font-medium text-text">
          {formatInr(raised)} of {formatInr(MONTHLY_GOAL_INR)}
          <span className="ml-1.5 font-normal text-text-muted">({percent}%)</span>
        </p>
      </div>
      <div
        role="progressbar"
        aria-labelledby="sponsor-goal-heading"
        aria-valuemin={0}
        aria-valuemax={MONTHLY_GOAL_INR}
        aria-valuenow={Math.min(raised, MONTHLY_GOAL_INR)}
        aria-valuetext={`${formatInr(raised)} of ${formatInr(MONTHLY_GOAL_INR)}`}
        className="h-1.5 overflow-hidden rounded-full bg-border"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
      </div>
    </section>
  );
}
