/**
 * Compact relative time for dense timelines — "2d ago", "1w ago", "3mo ago" —
 * as in the Home redesign's "Recently active" list.
 *
 * `formatRelativeTime` (the long, `Intl`-based "2 days ago" form) is still
 * what every prose sentence uses; this is only for the narrow monospace
 * column where the long form wouldn't fit.
 *
 * Real elapsed time only — never fabricates a "fresh" timestamp (rule 47).
 * Returns an empty string for an unparseable date rather than "NaNd ago"
 * (rule 49).
 */
export function formatCompactRelativeTime(isoDate: string, now: number = Date.now()): string {
  const then = new Date(isoDate).getTime();
  if (Number.isNaN(then)) return "";

  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;

  return `${Math.floor(days / 365)}y ago`;
}
