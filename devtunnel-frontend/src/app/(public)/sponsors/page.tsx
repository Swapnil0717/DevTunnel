// devtunnel-frontend/src/app/(public)/sponsors/page.tsx
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SPONSOR_URL } from "@/lib/config";
import { ExternalLinkIcon } from "@/components/layout/nav-icons";
import { getSponsorsData } from "@/lib/sponsors/api";
import { SPONSOR_BUTTON_NOTE, SPONSORS_PAGE_INTRO, SPONSORS_PAGE_TITLE } from "@/lib/sponsors/sponsors";
import { SponsorGoalBar } from "@/components/sponsors/sponsor-goal-bar";
import { SponsorTiers } from "@/components/sponsors/sponsor-tiers";
import { SponsorWall } from "@/components/sponsors/sponsor-wall";

export const metadata: Metadata = buildMetadata({
  title: "Support DevTunnel",
  description:
    "DevTunnel is free and open source. See what sponsorships pay for, the monthly goal, and the people who keep it running.",
  path: "/sponsors",
});

/**
 * ISR: the page is generated once and refreshed at most every 5 minutes
 * (matches the backend's own 5-minute cache). Not SSR and not `no-store`.
 * Next requires this to be a literal number here, so it can't reuse
 * `SPONSORS_REVALIDATE_SECONDS` from `lib/sponsors/api.ts` — keep them equal.
 */
export const revalidate = 300;

/**
 * `/sponsors` — where "Sponsor" in the sidebar and the post-PR card lead.
 * People see what the money pays for, the goal and who already supports the
 * project *before* the single Razorpay button, so the ask reads as joining
 * something rather than a demand.
 *
 * The goal and the sponsor wall come from the public `GET /sponsors`
 * (`getSponsorsData()`, no cookies, so it works for signed-out visitors and
 * can be cached). If the API is down the page quietly falls back to the
 * static values in `lib/sponsors/sponsors.ts` (empty wall, empty bar): no
 * error is ever shown to the visitor. The tiers and copy are static.
 * DevTunnel takes no payment itself; the button opens `SPONSOR_URL`
 * (Razorpay) in a new tab. When that isn't configured the button is replaced
 * by a short note instead of a link that goes nowhere.
 */
export default async function SponsorsPage() {
  const { goal, sponsors, counts } = await getSponsorsData();

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="m-0 mb-1.5 text-xl font-medium text-text">{SPONSORS_PAGE_TITLE}</h1>
      <p className="m-0 mb-5 max-w-xl text-[13px] leading-relaxed text-text-secondary">
        {SPONSORS_PAGE_INTRO}
      </p>

      <SponsorGoalBar goal={goal} />
      <SponsorTiers />

      <div className="mb-6">
        {SPONSOR_URL ? (
          <>
            <a
              href={SPONSOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md bg-text px-3.5 py-2 text-[13px] font-medium text-bg transition-colors hover:bg-text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Sponsor with Razorpay
              <ExternalLinkIcon className="h-3.5 w-3.5" />
              <span className="sr-only">(opens Razorpay in a new tab)</span>
            </a>
            <p className="m-0 mt-1.5 text-[11.5px] text-text-dim">
              {SPONSOR_BUTTON_NOTE}
            </p>
          </>
        ) : (
          <p className="m-0 text-[12.5px] text-text-muted">
            Sponsorship payments aren&apos;t open yet. Check back soon.
          </p>
        )}
      </div>

      <SponsorWall sponsors={sponsors} total={counts.total} />
    </main>
  );
}
