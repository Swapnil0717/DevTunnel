// devtunnel-frontend/src/lib/sponsors/sponsors.ts

/**
 * Hand-edited data for the `/sponsors` page.
 *
 * DevTunnel takes no payment itself and its backend never learns who paid
 * (see `SPONSOR_URL` in `lib/config.ts` — the Razorpay page is external), so
 * the sponsor wall is a list you maintain by hand, here, after you see a
 * payment in the Razorpay dashboard. Nothing on the page is invented: while
 * `SPONSORS` is empty the wall shows a "Be the first sponsor" card, and
 * while `RAISED_THIS_MONTH_INR` is 0 the goal bar is empty.
 *
 * A later step (a Razorpay webhook that records payments in Supabase) can
 * replace this file with a fetch from `GET /sponsors` without touching the
 * page components — they only depend on the types below.
 *
 * To add a sponsor: append an entry to `SPONSORS`, update
 * `RAISED_THIS_MONTH_INR`, and deploy. Only list people who asked to be
 * shown, and only put an `amountInr` on someone who agreed to show it.
 */

export type SponsorTierId = "supporter" | "backer" | "champion";

export interface SponsorTier {
  id: SponsorTierId;
  name: string;
  /** Suggested amount in rupees. The sponsor types the final amount on Razorpay. */
  amountInr: number;
  /** One perk you can actually deliver by hand. */
  perk: string;
}

export interface Sponsor {
  /**
   * Display name. Leave out (or `null`) for a sponsor who wants to stay
   * anonymous — the wall then shows "Anonymous".
   */
  name?: string | null;
  tier: SponsorTierId;
  /**
   * Only set when the sponsor agreed to show what they gave. Without it the
   * wall shows "Amount hidden".
   */
  amountInr?: number;
  /**
   * GitHub username, only used for Backer and Champion (their perk is a link
   * to their profile). Ignored for anonymous sponsors.
   */
  githubUsername?: string;
}

/** What this month's hosting and AI costs add up to. */
export const MONTHLY_GOAL_INR = 7000;

/**
 * How much has come in this month toward `MONTHLY_GOAL_INR`, from the
 * Razorpay dashboard. Kept separate from the sponsor list because some
 * sponsors hide their amount, so the total can't be summed from the wall.
 */
export const RAISED_THIS_MONTH_INR = 0;

export const SPONSOR_TIERS: readonly SponsorTier[] = [
  { id: "supporter", name: "Supporter", amountInr: 199, perk: "Name on the sponsor wall" },
  { id: "backer", name: "Backer", amountInr: 499, perk: "Wall + link to your GitHub" },
  { id: "champion", name: "Champion", amountInr: 999, perk: "Pinned to the top strip" },
];

/** Starts empty on purpose — see the file comment. */
export const SPONSORS: readonly Sponsor[] = [];

export const TIER_RANK: Record<SponsorTierId, number> = {
  champion: 0,
  backer: 1,
  supporter: 2,
};

export function tierName(id: SponsorTierId): string {
  return SPONSOR_TIERS.find((tier) => tier.id === id)?.name ?? id;
}

const rupees = new Intl.NumberFormat("en-IN");

export function formatInr(amount: number): string {
  return `₹${rupees.format(amount)}`;
}

/** GitHub usernames are alphanumerics and single hyphens, up to 39 characters. */
const GITHUB_USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/**
 * Profile URL for a sponsor who gets a GitHub link, or `null`. Anonymous
 * sponsors and the Supporter tier never get one, and a mistyped username is
 * dropped rather than rendered as a broken link.
 */
export function sponsorProfileUrl(sponsor: Sponsor): string | null {
  if (!sponsor.name || sponsor.tier === "supporter" || !sponsor.githubUsername) return null;
  return GITHUB_USERNAME.test(sponsor.githubUsername)
    ? `https://github.com/${sponsor.githubUsername}`
    : null;
}

/** Sponsors ordered Champion → Backer → Supporter, keeping list order within a tier. */
export function sortedSponsors(sponsors: readonly Sponsor[] = SPONSORS): Sponsor[] {
  return sponsors
    .map((sponsor, index) => ({ sponsor, index }))
    .sort((a, b) => TIER_RANK[a.sponsor.tier] - TIER_RANK[b.sponsor.tier] || a.index - b.index)
    .map(({ sponsor }) => sponsor);
}
