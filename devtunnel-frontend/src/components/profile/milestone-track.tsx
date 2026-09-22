import {
  SeedlingIcon,
  FlameIcon,
  BoltIcon,
  TrophyIcon,
  CrownIcon,
  ChecklistIcon,
  GitPullRequestIcon,
} from "@/components/layout/nav-icons";
import type { MilestoneWindow, MilestoneCheckpoint } from "@/lib/profile/types";

const CHECKPOINT_ICONS: Record<MilestoneCheckpoint["iconId"], (props: { className?: string }) => JSX.Element> = {
  seedling: SeedlingIcon,
  flame: FlameIcon,
  bolt: BoltIcon,
  trophy: TrophyIcon,
  crown: CrownIcon,
};

/** Pixel width of each absolutely-positioned checkpoint label — keep in step with the `w-[74px]` below. */
const CHECKPOINT_LABEL_WIDTH = 74;

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function dateLabel(dateStr: string): string {
  const [yearStr, monthStr, dayStr] = dateStr.split("-") as [string, string, string];
  return DATE_LABEL_FORMATTER.format(
    new Date(Date.UTC(Number(yearStr), Number(monthStr) - 1, Number(dayStr))),
  );
}

/**
 * The profile page's "30-day milestones" section, server-rendered from
 * `MilestoneWindow` (`GET /users/me/contributions/milestones` —
 * devtunnel-backend src/routes/devtunnelStats.ts, shaped by
 * src/lib/milestones.ts). No client JS needed here — unlike the
 * contribution-history calendar's month navigation, this window has
 * nothing for the visitor to page through, so it can render fully on the
 * server (Frontend_Development_Rules.txt rule 38).
 *
 * "Active day" is deliberately one combined fact — GitHub activity and
 * DevTunnel activity both count toward the same day — even though the
 * "Contributions" stat card above keeps those two sources side by side.
 * See the route's own comment for why this section treats them
 * differently.
 *
 * The two bonus goal targets (5 tasks, 2 pull requests) are example
 * numbers, not tuned figures — see devtunnel-backend
 * src/lib/milestones.ts BONUS_GOALS for where to change them.
 *
 * `milestoneWindow` is `null` when the endpoint failed to load server-side — an
 * honest "not available" panel is shown rather than a guessed or
 * zeroed-out track (rule 58/59).
 */
export function MilestoneTrack({ milestoneWindow }: { milestoneWindow: MilestoneWindow | null }) {
  if (!milestoneWindow) {
    return (
      <div className="mb-5 rounded-lg bg-surface px-4 py-4" aria-label="30-day milestones">
        <p className="m-0 text-[13px] text-text-muted">
          Milestone progress isn&apos;t available right now.
        </p>
      </div>
    );
  }

  const { days, activeDayCount, checkpoints, nextCheckpoint, bonusGoals, fromDate, toDate } = milestoneWindow;
  const progressPercent = Math.min(100, (activeDayCount / milestoneWindow.windowDays) * 100);

  // Each checkpoint label is a fixed CHECKPOINT_LABEL_WIDTH-px box centered
  // (`-translate-x-1/2`) on a `left: N%` position along the track, so two
  // checkpoints whose thresholds are close together (today: "Warm-up" at
  // day 3 and "Regular" at day 7, 13% of the 30-day window apart) need the
  // track itself to be wide enough that 13% of it still clears
  // CHECKPOINT_LABEL_WIDTH px, or their labels print on top of each other.
  // Computed from the real thresholds rather than hardcoded to today's
  // values, so this keeps working if the backend's MILESTONE_CHECKPOINTS
  // ever change. `trackMinWidth` is the narrowest the track can ever get
  // without guaranteeing an overlap; below that width the track scrolls
  // horizontally instead (see the wrapping `overflow-x-auto` below) —
  // same "scroll rather than collide" pattern the rest of this app uses
  // for wide tables and the contribution calendar.
  const smallestCheckpointGapPercent = checkpoints
    .map((checkpoint) => checkpoint.threshold / milestoneWindow.windowDays)
    .sort((a, b) => a - b)
    .reduce<number | null>((smallest, position, index, positions) => {
      if (index === 0) return smallest;
      const previous = positions[index - 1];
      if (previous === undefined) return smallest;
      const gap = position - previous;
      if (gap <= 0) return smallest;
      return smallest === null ? gap : Math.min(smallest, gap);
    }, null);
  const trackMinWidth = Math.max(
    320,
    smallestCheckpointGapPercent
      ? Math.ceil(CHECKPOINT_LABEL_WIDTH / smallestCheckpointGapPercent)
      : 320,
  );

  return (
    <div className="mb-5" aria-label="30-day milestones">
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2.5">
        <div>
          <p className="m-0 text-sm font-medium text-text">30-day milestones</p>
          <p className="m-0 text-[11px] text-text-dim">
            Days you contributed in the last 30 days · rolling window
          </p>
        </div>
        <p className="m-0 text-right text-[22px] font-medium leading-[1.2] text-text">
          {activeDayCount}{" "}
          <span className="text-[13px] font-normal text-text-dim">
            / {milestoneWindow.windowDays} active days
          </span>
        </p>
      </div>

      <div className="rounded-lg bg-surface px-3 py-3.5">
        {/* Day strip */}
        <div
          className="mb-1 flex gap-[3px]"
          role="img"
          aria-label={`${activeDayCount} of ${milestoneWindow.windowDays} days active`}
        >
          {days.map((day) => (
            <span
              key={day.date}
              title={`${dateLabel(day.date)} — ${day.active ? "Active day" : "No activity"}`}
              className={`h-3.5 flex-1 rounded-[3px] ${day.active ? "bg-accent" : "bg-surface-raised"}`}
            />
          ))}
        </div>
        <div className="mb-4 flex justify-between">
          <span className="text-[11px] text-text-dim">{dateLabel(fromDate)}</span>
          <span className="text-[11px] text-text-dim">{dateLabel(toDate)}</span>
        </div>

        {/* Checkpoint track — horizontally scrollable rather than squeezed:
            below `trackMinWidth` the fixed-width labels below would start
            overlapping (see the comment above), so the track keeps its
            computed minimum width and scrolls instead. The `-mx-3 px-3`
            / `sm:mx-0 sm:px-0` pair bleeds the scroll area to the
            surrounding panel's own edges on mobile, same technique the
            profile page's contribution calendar uses. */}
        <div className="-mx-3 overflow-x-auto overflow-y-hidden px-3 sm:mx-0 sm:overflow-visible sm:px-0">
          <div className="relative mx-[38px] h-[84px]" style={{ minWidth: `${trackMinWidth}px` }}>
            <div className="absolute left-0 right-0 top-[15px] h-1 rounded-full bg-border" />
            <div
              className="absolute left-0 top-[15px] h-1 rounded-full bg-accent"
              style={{ width: `${progressPercent}%` }}
            />
            {checkpoints.map((checkpoint) => {
              const Icon = CHECKPOINT_ICONS[checkpoint.iconId];
              const isNext = nextCheckpoint?.id === checkpoint.id;
              const statusText = checkpoint.reached
                ? "Reached"
                : isNext
                  ? `${checkpoint.daysRemaining} more day${checkpoint.daysRemaining === 1 ? "" : "s"}`
                  : "Locked";

              return (
                <div
                  key={checkpoint.id}
                  className="absolute top-0 w-[74px] -translate-x-1/2 text-center"
                  style={{ left: `${(checkpoint.threshold / milestoneWindow.windowDays) * 100}%` }}
                >
                  <div
                    className={`mx-auto mb-1.5 flex h-[34px] w-[34px] items-center justify-center rounded-full border ${
                      checkpoint.reached
                        ? "border-accent bg-surface-selected text-status-success-label"
                        : isNext
                          ? "border-dashed border-status-success-label bg-bg text-text"
                          : "border-dashed border-border-subtle bg-bg text-text-disabled"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <p
                    className={`m-0 text-[11px] ${
                      checkpoint.reached || isNext ? "text-text-secondary" : "text-text-muted"
                    }`}
                  >
                    {checkpoint.label}
                  </p>
                  <p className="m-0 text-[10.5px] text-text-dim">Day {checkpoint.threshold}</p>
                  <p
                    className={`m-0 text-[10.5px] ${
                      checkpoint.reached
                        ? "text-status-success-label"
                        : isNext
                          ? "text-text"
                          : "text-text-faint"
                    }`}
                  >
                    {statusText}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <p className="mt-1.5 text-center text-[12.5px]">
          {nextCheckpoint ? (
            <span className="text-text-muted">
              Next: <span className="text-text">{nextCheckpoint.label}</span> ·{" "}
              {nextCheckpoint.daysRemaining} more active day
              {nextCheckpoint.daysRemaining === 1 ? "" : "s"}
            </span>
          ) : (
            <span className="text-status-success-label">
              Full month reached. Every day counted.
            </span>
          )}
        </p>
      </div>

      {/* Bonus goals */}
      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {bonusGoals.map((goal) => {
          const Icon = goal.id === "tasks" ? ChecklistIcon : GitPullRequestIcon;
          const iconColor = goal.id === "tasks" ? "text-status-info-text" : "text-tag-skill-text";
          const barColor = goal.id === "tasks" ? "bg-status-info" : "bg-tag-skill-text";
          const percent = Math.min(100, (goal.current / goal.target) * 100);

          return (
            <div key={goal.id} className="rounded-lg bg-surface px-3 py-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <p className="m-0 flex items-center gap-1.5 text-[12px] text-text-secondary">
                  <Icon className={`h-3.5 w-3.5 ${iconColor}`} />
                  {goal.label}
                </p>
                <p className="m-0 text-[12px] text-text-muted">
                  {goal.current} of {goal.target}
                </p>
              </div>
              <div className="h-1 rounded-full bg-border" aria-hidden="true">
                <div className={`h-1 rounded-full ${barColor}`} style={{ width: `${percent}%` }} />
              </div>
              <span className="sr-only">
                {goal.reached ? "Goal reached" : `${goal.current} of ${goal.target} complete`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
