import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sponsors — public read side of `devtunnel.sponsorships` / `sponsor_goals`
 * (sql/048, sql/049). Backs `GET /sponsors` (src/routes/sponsors.ts).
 *
 * Exactly TWO Supabase calls per load, run in parallel:
 *   1. the wall: captured AND approved AND NOT hidden, champions first, then
 *      backers, then supporters, newest first within a tier, capped at 200
 *      (the same request also returns the uncapped count);
 *   2. `sponsor_goal_summary` (sql/049): the month's goal and raised total.
 *
 * PRIVACY is enforced HERE, in `toPublicSponsor`, not in the frontend:
 *   - the query never selects razorpay ids, events, notes, email or phone
 *     (the table doesn't hold email/phone at all);
 *   - an anonymous sponsor's name and githubUsername become null;
 *   - `amountInr` is null unless show_amount is true;
 *   - `raisedInr` is the real month total (anonymous and hidden-amount
 *     payments included, hidden/unapproved rows too) but is a single number:
 *     no per-person amount can be derived from it.
 */

/* ------------------------------------------------------------------------
 * Public response type — copy this block to the frontend as-is.
 * ---------------------------------------------------------------------- */

export type SponsorTierId = "supporter" | "backer" | "champion";

export interface PublicSponsor {
  /** null for an anonymous sponsor, or one who left no name. */
  name: string | null;
  tier: SponsorTierId;
  /** null for an anonymous sponsor, or one who left no username. */
  githubUsername: string | null;
  /** Rupees. null unless the sponsor chose to show their amount. */
  amountInr: number | null;
  /** ISO 8601 timestamp of the payment. */
  paidAt: string;
}

export interface SponsorsResponse {
  goal: {
    /** India-time calendar month, "YYYY-MM". */
    month: string;
    goalInr: number;
    /** Everything captured this month, including anonymous / hidden-amount payments. */
    raisedInr: number;
    /** Rounded to a whole number. NOT capped: 130 means the goal was beaten. Clamp the bar, not the number. */
    percent: number;
  };
  /** Up to 200, champions first, then backers, then supporters; newest first within a tier. */
  sponsors: PublicSponsor[];
  /** `total` counts every sponsor on the wall, not just the (up to 200) returned. */
  counts: { total: number };
}

/* ------------------------------------------------------------------------ */

export const MAX_WALL_ENTRIES = 200;
/** Used only if `sponsor_goals` is completely empty. Mirrors the seed in sql/048 (Rs 7,000). */
export const FALLBACK_GOAL_PAISE = 700_000;

const WALL_COLUMNS = "display_name, github_username, is_anonymous, show_amount, tier, amount_paise, paid_at";

export interface WallRow {
  display_name: string | null;
  github_username: string | null;
  is_anonymous: boolean;
  show_amount: boolean;
  tier: string;
  amount_paise: number;
  paid_at: string | null;
}

export interface GoalSummaryRow {
  goal_paise: number | null;
  raised_paise: number | string | null;
}

/** "YYYY-MM" for the calendar month it currently is in India (UTC+5:30, no DST). */
export function istMonthKey(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

function toTier(value: string): SponsorTierId {
  return value === "champion" || value === "backer" ? value : "supporter";
}

export function toPublicSponsor(row: WallRow): PublicSponsor {
  const anonymous = row.is_anonymous === true;
  return {
    name: anonymous ? null : row.display_name,
    tier: toTier(row.tier),
    githubUsername: anonymous ? null : row.github_username,
    amountInr: row.show_amount === true ? row.amount_paise / 100 : null,
    // The table guarantees paid_at on captured rows; the fallback is never expected to be used.
    paidAt: row.paid_at ?? new Date(0).toISOString(),
  };
}

export function buildSponsorsResponse(
  month: string,
  rows: WallRow[],
  totalOnWall: number | null,
  summary: GoalSummaryRow | null,
): SponsorsResponse {
  const goalPaise = summary?.goal_paise && summary.goal_paise > 0 ? summary.goal_paise : FALLBACK_GOAL_PAISE;
  const raisedPaise = Math.max(0, Number(summary?.raised_paise ?? 0) || 0);
  const sponsors = rows.slice(0, MAX_WALL_ENTRIES).map(toPublicSponsor);

  return {
    goal: {
      month,
      goalInr: goalPaise / 100,
      raisedInr: raisedPaise / 100,
      percent: Math.round((raisedPaise / goalPaise) * 100),
    },
    sponsors,
    counts: { total: totalOnWall ?? sponsors.length },
  };
}

export async function loadSponsorsResponse(supabase: SupabaseClient): Promise<SponsorsResponse> {
  const month = istMonthKey();

  const [wall, summary] = await Promise.all([
    supabase
      .from("sponsorships")
      .select(WALL_COLUMNS, { count: "exact" })
      .eq("status", "captured")
      .eq("approved", true)
      .eq("hidden", false)
      .order("tier_rank", { ascending: true })
      .order("paid_at", { ascending: false })
      .limit(MAX_WALL_ENTRIES),
    supabase.rpc("sponsor_goal_summary", { p_month: `${month}-01` }),
  ]);

  if (wall.error) throw new Error(`Failed to read sponsorships: ${wall.error.message}`);
  if (summary.error) throw new Error(`Failed to read sponsor_goal_summary: ${summary.error.message}`);

  const summaryRow = (Array.isArray(summary.data) ? summary.data[0] : summary.data) as GoalSummaryRow | null;
  return buildSponsorsResponse(month, (wall.data ?? []) as WallRow[], wall.count, summaryRow ?? null);
}
