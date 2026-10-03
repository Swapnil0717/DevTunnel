// devtunnel-frontend/src/lib/sponsors/sponsors.ts
import type { PublicSponsor, SponsorTierId } from "./api";

/**
 * Static parts of the `/sponsors` page: tiers, perks and copy, plus the
 * helpers the components share.
 *
 * The LIVE data (this month's goal and raised total, and the sponsor wall)
 * now comes from `GET /sponsors` via `getSponsorsData()` in `./api.ts`. The
 * three values marked FALLBACK below are used only when that call fails, so
 * the page never breaks. They are deliberately empty/zero (nothing invented):
 * an empty wall shows "Be the first sponsor" and an empty goal bar.
 * Don't hand-edit them to show sponsors; add or approve sponsors through the
 * admin API instead.
 */

/* ---------------------------------------------------------------------------
 * Tier thresholds — ONE source of truth: the backend.
 *
 * These MIRROR `SPONSOR_TIERS` in devtunnel-backend/src/lib/sponsorRules.ts
 * (Part 2: backerMinPaise 50,000 and championMinPaise 200,000 paise) and the
 * generated `tier` column in sql/048_sponsorships.sql. The backend decides
 * every sponsor's tier from the amount; this file only DESCRIBES those rules
 * to visitors. If you change a threshold, change it in the backend first
 * (the SQL header explains how), then update these two numbers (rupees).
 * ------------------------------------------------------------------------- */
export const BACKER_MIN_INR = 500;
export const CHAMPION_MIN_INR = 2000;

export interface SponsorTier {
  id: SponsorTierId;
  name: string;
  /** The amount range that earns this tier, derived from the thresholds above. */
  range: string;
  /** One perk you can actually deliver by hand. */
  perk: string;
}

/** FALLBACK: what this month's hosting and AI costs add up to (used only if the API call fails). */
export const MONTHLY_GOAL_INR = 7000;

/** FALLBACK: raised this month (used only if the API call fails). */
export const RAISED_THIS_MONTH_INR = 0;

/** FALLBACK: the sponsor wall (used only if the API call fails). Empty on purpose. */
export const SPONSORS: readonly PublicSponsor[] = [];

/**
 * Page copy shared by `app/(public)/sponsors/page.tsx` and its `loading.tsx`,
 * which ghosts this exact text so the skeleton wraps onto the same number of
 * lines as the real page (no layout shift). Edit it here, once.
 */
export const SPONSORS_PAGE_TITLE = "Support DevTunnel";
export const SPONSORS_PAGE_INTRO =
  "DevTunnel is free and open source. Sponsorships pay for hosting, AI costs, and the time spent keeping it running. Sponsoring never affects how your pull request is reviewed.";
export const SPONSOR_BUTTON_NOTE =
  "Opens Razorpay in a new tab. Your payment is handled securely by Razorpay.";
export const SPONSOR_TIERS_CAPTION = "Your tier follows the amount you enter on Razorpay.";
export const SPONSOR_GOAL_HEADING = "Monthly goal: hosting and AI costs";

const rupees = new Intl.NumberFormat("en-IN");

export function formatInr(amount: number): string {
  return `₹${rupees.format(amount)}`;
}

export const SPONSOR_TIERS: readonly SponsorTier[] = [
  {
    id: "supporter",
    name: "Supporter",
    range: `Under ${formatInr(BACKER_MIN_INR)}`,
    perk: "Name on the sponsor wall",
  },
  {
    id: "backer",
    name: "Backer",
    range: `${formatInr(BACKER_MIN_INR)} to ${formatInr(CHAMPION_MIN_INR - 1)}`,
    perk: "Wall + link to your GitHub",
  },
  {
    id: "champion",
    name: "Champion",
    range: `${formatInr(CHAMPION_MIN_INR)} and above`,
    perk: "Pinned to the top strip",
  },
];

export const TIER_RANK: Record<SponsorTierId, number> = {
  champion: 0,
  backer: 1,
  supporter: 2,
};

export function tierName(id: SponsorTierId): string {
  return SPONSOR_TIERS.find((tier) => tier.id === id)?.name ?? id;
}

/** GitHub usernames are alphanumerics and single hyphens, up to 39 characters. */
const GITHUB_USERNAME = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

/**
 * Profile URL for a sponsor who gets a GitHub link, or `null`. Anonymous
 * sponsors and the Supporter tier never get one, and a mistyped username is
 * dropped rather than rendered as a broken link.
 */
export function sponsorProfileUrl(sponsor: PublicSponsor): string | null {
  if (!sponsor.name || sponsor.tier === "supporter" || !sponsor.githubUsername) return null;
  return GITHUB_USERNAME.test(sponsor.githubUsername)
    ? `https://github.com/${sponsor.githubUsername}`
    : null;
}

/**
 * GitHub username to load an avatar for, or `null`. Only Backers and Champions
 * get an avatar (Supporters show an initial), and a username that isn't valid
 * GitHub format is dropped. The backend already sends `githubUsername: null`
 * for anonymous sponsors, so an anonymous sponsor never gets one either.
 */
export function sponsorAvatarUsername(sponsor: PublicSponsor): string | null {
  if (sponsor.tier === "supporter" || !sponsor.githubUsername) return null;
  return GITHUB_USERNAME.test(sponsor.githubUsername) ? sponsor.githubUsername : null;
}

/** Sponsors ordered Champion → Backer → Supporter, keeping list order within a tier. */
export function sortedSponsors(sponsors: readonly PublicSponsor[]): PublicSponsor[] {
  return sponsors
    .map((sponsor, index) => ({ sponsor, index }))
    .sort((a, b) => TIER_RANK[a.sponsor.tier] - TIER_RANK[b.sponsor.tier] || a.index - b.index)
    .map(({ sponsor }) => sponsor);
}
