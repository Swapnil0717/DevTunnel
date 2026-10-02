// devtunnel-frontend/src/app/(public)/sponsors/page.tsx
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { SPONSOR_URL } from "@/lib/config";
import { ExternalLinkIcon } from "@/components/layout/nav-icons";
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
 * `/sponsors` — where "Sponsor" in the sidebar and the post-PR card lead.
 * People see what the money pays for, the goal and who already supports the
 * project *before* the single Razorpay button, so the ask reads as joining
 * something rather than a demand.
 *
 * Fully static: the goal, tiers and sponsor wall all come from
 * `lib/sponsors/sponsors.ts` (hand-edited, starts empty — no invented data),
 * so the page needs no API call and works for signed-out visitors. DevTunnel
 * takes no payment itself; the button opens `SPONSOR_URL` (Razorpay) in a new
 * tab. When that isn't configured the button is replaced by a short note
 * instead of a link that goes nowhere.
 */
export default function SponsorsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="m-0 mb-1.5 text-xl font-medium text-text">Support DevTunnel</h1>
      <p className="m-0 mb-5 max-w-xl text-[13px] leading-relaxed text-text-secondary">
        DevTunnel is free and open source. Sponsorships pay for hosting, AI costs, and the time
        spent keeping it running. Sponsoring never affects how your pull request is reviewed.
      </p>

      <SponsorGoalBar />
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
              Opens Razorpay in a new tab. Add your GitHub username and choose whether your amount
              is shown.
            </p>
          </>
        ) : (
          <p className="m-0 text-[12.5px] text-text-muted">
            Sponsorship payments aren&apos;t open yet. Check back soon.
          </p>
        )}
      </div>

      <SponsorWall />
    </main>
  );
}
