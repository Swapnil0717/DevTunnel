import type { MilestoneWindow, MilestoneCheckpoint, MilestoneBonusGoal } from "../types";

/**
 * The profile page's "30-day milestones" section (devtunnel-frontend
 * components/profile/milestone-track.tsx) — a rolling 30-day window over
 * `devtunnel.activity_log` (own rows) merged with the caller's GitHub
 * contribution calendar for the same window, counted as one combined
 * "active day" set. See db/devtunnelStats.ts getDevTunnelActivityWindow
 * for where the raw counts come from, and routes/devtunnelStats.ts for
 * where the GitHub side is merged in.
 *
 * Checkpoint thresholds and bonus goal targets are plain constants, not a
 * database table — they're the same for every contributor on the
 * platform and change only when this feature's design changes, so a row
 * for them would make a copy edit a migration for no benefit (same
 * reasoning as sql/027's header on why the fixed contribution-ways
 * catalog isn't a table either).
 */

export interface MilestoneCheckpointDefinition {
  id: string;
  label: string;
  /** Active days required, out of the 30-day window. */
  threshold: number;
  /** Icon id — devtunnel-frontend maps this to one of nav-icons.tsx. */
  iconId: "seedling" | "flame" | "bolt" | "trophy" | "crown";
}

export const MILESTONE_CHECKPOINTS: readonly MilestoneCheckpointDefinition[] = [
  { id: "warm-up", label: "Warm-up", threshold: 3, iconId: "seedling" },
  { id: "regular", label: "Regular", threshold: 7, iconId: "flame" },
  { id: "consistent", label: "Consistent", threshold: 14, iconId: "bolt" },
  { id: "committed", label: "Committed", threshold: 21, iconId: "trophy" },
  { id: "full-month", label: "Full month", threshold: 30, iconId: "crown" },
];

export interface BonusGoalDefinition {
  id: "tasks" | "pullRequests";
  label: string;
  target: number;
}

/**
 * Targets are examples, not tuned figures — flagged as such wherever
 * they reach the frontend (see milestone-track.tsx) so a product owner
 * knows to revisit them rather than assume they were chosen with data.
 */
export const BONUS_GOALS: readonly BonusGoalDefinition[] = [
  { id: "tasks", label: "Tasks completed", target: 5 },
  { id: "pullRequests", label: "Pull requests merged", target: 2 },
];

export const WINDOW_DAYS = 30;

/** Inclusive [from, to] Date bounds for the rolling `WINDOW_DAYS`-day window, anchored on `now`. */
export function windowBounds(now: Date = new Date()): { from: Date; to: Date } {
  const to = new Date(now);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (WINDOW_DAYS - 1));
  return { from, to };
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Builds the full `MilestoneWindow` response from raw per-day activity
 * counts. `activeDayCounts` may combine more than one source (GitHub +
 * DevTunnel) — this function only cares whether a given date had any
 * activity at all, never which source it came from, since "active day"
 * is a single combined fact on this card (contrast with the
 * "Contributions" stat card, which deliberately keeps GitHub and
 * DevTunnel separate).
 *
 * `tasksCompleted` / `pullRequestsMerged` are the counts of those event
 * types within the same window, from `devtunnel.activity_log` — see
 * getDevTunnelActivityWindow.
 */
export function buildMilestoneWindow(
  activeDayCounts: Map<string, number>,
  tasksCompleted: number,
  pullRequestsMerged: number,
  now: Date = new Date(),
): MilestoneWindow {
  const { from, to } = windowBounds(now);

  const days: MilestoneWindow["days"] = [];
  let activeDayCount = 0;
  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime()) {
    const date = toDateKey(cursor);
    const count = activeDayCounts.get(date) ?? 0;
    const active = count > 0;
    if (active) activeDayCount += 1;
    days.push({ date, active });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  let nextCheckpointId: string | null = null;
  const checkpoints: MilestoneCheckpoint[] = MILESTONE_CHECKPOINTS.map((def) => {
    const reached = activeDayCount >= def.threshold;
    if (!reached && nextCheckpointId === null) nextCheckpointId = def.id;
    return {
      id: def.id,
      label: def.label,
      threshold: def.threshold,
      iconId: def.iconId,
      reached,
      daysRemaining: reached ? 0 : def.threshold - activeDayCount,
    };
  });

  const nextCheckpoint = nextCheckpointId
    ? (checkpoints.find((cp) => cp.id === nextCheckpointId) ?? null)
    : null;

  const rawGoals: Record<BonusGoalDefinition["id"], number> = {
    tasks: tasksCompleted,
    pullRequests: pullRequestsMerged,
  };

  const bonusGoals: MilestoneBonusGoal[] = BONUS_GOALS.map((def) => {
    const current = rawGoals[def.id];
    return {
      id: def.id,
      label: def.label,
      current,
      target: def.target,
      reached: current >= def.target,
    };
  });

  return {
    fromDate: toDateKey(from),
    toDate: toDateKey(to),
    windowDays: WINDOW_DAYS,
    activeDayCount,
    days,
    checkpoints,
    nextCheckpoint,
    bonusGoals,
  };
}