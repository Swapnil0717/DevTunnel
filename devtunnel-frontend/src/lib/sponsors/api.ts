// devtunnel-frontend/src/lib/sponsors/api.ts
// Server Component only. Public data: no cookies are read or forwarded.
import { API_BASE_URL } from "@/lib/config";
import { MONTHLY_GOAL_INR, RAISED_THIS_MONTH_INR, SPONSORS } from "./sponsors";

/* ---------------------------------------------------------------------------
 * Response types — copied as-is from the backend
 * (devtunnel-backend/src/db/sponsorsPublic.ts, Part 3). Keep the two in sync.
 * ------------------------------------------------------------------------- */

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

/**
 * Matches the backend's own 5-minute cache (`s-maxage=300` on GET /sponsors),
 * so the page is regenerated at most every 5 minutes: ISR, not SSR and not
 * `no-store`, which keeps this cheap on the Workers Free plan. The page
 * exports the same number as `revalidate`.
 */
export const SPONSORS_REVALIDATE_SECONDS = 300;

const TIERS: readonly string[] = ["supporter", "backer", "champion"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function parseSponsor(value: unknown): PublicSponsor | null {
  if (!isRecord(value)) return null;
  const { name, tier, githubUsername, amountInr, paidAt } = value;
  if (typeof tier !== "string" || !TIERS.includes(tier)) return null;
  return {
    name: typeof name === "string" ? name : null,
    tier: tier as SponsorTierId,
    githubUsername: typeof githubUsername === "string" ? githubUsername : null,
    // Only a real, non-negative number is ever shown; anything else means "hidden".
    amountInr: isFiniteNumber(amountInr) && amountInr >= 0 ? amountInr : null,
    paidAt: typeof paidAt === "string" ? paidAt : "",
  };
}

/**
 * Checks the body really is `{ data: SponsorsResponse }` before the page
 * trusts it. A malformed body is treated like "API down" (returns `null`)
 * instead of crashing the render. Individual bad sponsor rows are dropped.
 */
export function parseSponsorsResponse(json: unknown): SponsorsResponse | null {
  if (!isRecord(json) || !isRecord(json.data)) return null;
  const { goal, sponsors, counts } = json.data;
  if (!isRecord(goal) || !Array.isArray(sponsors)) return null;

  const { month, goalInr, raisedInr, percent } = goal;
  if (typeof month !== "string" || !isFiniteNumber(goalInr) || goalInr <= 0 || !isFiniteNumber(raisedInr)) {
    return null;
  }

  const list = sponsors.map(parseSponsor).filter((s): s is PublicSponsor => s !== null);
  const total = isRecord(counts) && isFiniteNumber(counts.total) ? counts.total : list.length;

  return {
    goal: {
      month,
      goalInr,
      raisedInr: Math.max(0, raisedInr),
      percent: isFiniteNumber(percent) ? Math.max(0, percent) : Math.round((Math.max(0, raisedInr) / goalInr) * 100),
    },
    sponsors: list,
    counts: { total: Math.max(total, list.length) },
  };
}

/** "YYYY-MM" for the current month in India time (UTC+5:30, no DST), like the backend. */
function currentIstMonth(now: Date = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * What the page shows when the API can't be reached: the static values in
 * `sponsors.ts` (empty wall, empty bar, default goal). Never an error.
 */
export function fallbackSponsorsData(): SponsorsResponse {
  const raised = Math.max(0, RAISED_THIS_MONTH_INR);
  return {
    goal: {
      month: currentIstMonth(),
      goalInr: MONTHLY_GOAL_INR,
      raisedInr: raised,
      percent: MONTHLY_GOAL_INR > 0 ? Math.round((raised / MONTHLY_GOAL_INR) * 100) : 0,
    },
    sponsors: [...SPONSORS],
    counts: { total: SPONSORS.length },
  };
}

/**
 * `GET /sponsors` -> the wall and this month's goal.
 *
 * Never throws and never returns an error state: a network failure, a
 * non-2xx status or an unexpected body all return `fallbackSponsorsData()`,
 * so `/sponsors` always renders. The failure is logged server-side only
 * (no sponsor data in the message), and nothing about it reaches the visitor.
 */
export async function getSponsorsData(): Promise<SponsorsResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/sponsors`, {
      next: { revalidate: SPONSORS_REVALIDATE_SECONDS },
    });

    if (!response.ok) {
      console.warn(`[sponsors] GET /sponsors returned ${response.status}; using fallback`);
      return fallbackSponsorsData();
    }

    const parsed = parseSponsorsResponse(await response.json());
    if (!parsed) {
      console.warn("[sponsors] GET /sponsors returned an unexpected body; using fallback");
      return fallbackSponsorsData();
    }
    return parsed;
  } catch (err) {
    console.warn(`[sponsors] GET /sponsors failed (${err instanceof Error ? err.name : "error"}); using fallback`);
    return fallbackSponsorsData();
  }
}
