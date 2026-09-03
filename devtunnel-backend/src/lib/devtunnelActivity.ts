import type { ContributionCalendar } from "../types";

/**
 * Inclusive [from, to] ISO bounds in UTC for a given YYYY-MM month.
 * Mirrors `monthBoundsISO` in src/routes/contributions.ts (kept as a
 * separate copy rather than a shared import so the GitHub-calendar route
 * — already shipped and working — never has to change as part of adding
 * the DevTunnel-native calendar).
 */
export function monthBoundsISO(month: string): { fromISO: string; toISO: string } {
  const [yearStr, monthStr] = month.split("-") as [string, string];
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const from = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59));
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

/**
 * Builds a `ContributionCalendar` (same shape GitHub's calendar uses —
 * see src/lib/githubGraphql.ts) for one calendar month out of a plain
 * date -> count map, for the DevTunnel-native "green squares" calendar
 * (GET /users/me/contributions/devtunnel).
 *
 * Pads out to full Sunday-start weeks so the grid looks identical to the
 * GitHub calendar's. Every day in that padded range is kept (not just
 * the ones inside `month`) so `days[i]`'s weekday always lines up with
 * its row in a Sun..Sat grid — days outside the requested month are
 * flagged `inMonth: false` (see markMonthMembership in
 * routes/contributions.ts for why dropping them instead shifts every
 * later day's row alignment) rather than removed, and don't count toward
 * `totalContributions`.
 */
export function buildDevtunnelMonthCalendar(
  dailyCounts: Map<string, number>,
  month: string,
): ContributionCalendar {
  const [yearStr, monthStr] = month.split("-") as [string, string];
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;

  const firstOfMonth = new Date(Date.UTC(year, monthIndex, 1));
  const lastOfMonth = new Date(Date.UTC(year, monthIndex + 1, 0));

  const start = new Date(firstOfMonth);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const end = new Date(lastOfMonth);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));

  const weeks: ContributionCalendar["weeks"] = [];
  let totalContributions = 0;
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    const days: ContributionCalendar["weeks"][number]["days"] = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const inMonth = dateStr.startsWith(month);
      const count = inMonth ? dailyCounts.get(dateStr) ?? 0 : 0;
      days.push({ date: dateStr, count, inMonth });
      if (inMonth) totalContributions += count;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push({ days });
  }

  return { totalContributions, weeks };
}