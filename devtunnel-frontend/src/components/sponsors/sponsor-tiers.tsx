// devtunnel-frontend/src/components/sponsors/sponsor-tiers.tsx
import { SPONSOR_TIERS, formatInr } from "@/lib/sponsors/sponsors";

/** The tier that gets the highlighted card. */
const FEATURED_TIER = "backer";

/**
 * Three suggested amounts. One Razorpay link can't know which tier someone
 * meant, so these are suggestions — the sponsor types the final amount on
 * Razorpay (any amount from the lowest tier up works). The highlighted card
 * says "Suggested" in words as well as with its border (rule 43).
 */
export function SponsorTiers() {
  return (
    <section aria-labelledby="sponsor-tiers-heading" className="mb-4">
      <h2 id="sponsor-tiers-heading" className="m-0 mb-2 text-[11.5px] font-normal text-text-muted">
        Suggested amounts. You enter the final amount on Razorpay.
      </h2>
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-3">
        {SPONSOR_TIERS.map((tier) => {
          const featured = tier.id === FEATURED_TIER;
          return (
            <li
              key={tier.id}
              className={`rounded-[10px] p-3 ${
                featured
                  ? "border border-accent bg-surface-selected"
                  : "border border-border bg-surface"
              }`}
            >
              <p className="m-0 flex items-center justify-between gap-2 text-[13px] font-medium text-text">
                {tier.name}
                {featured ? (
                  <span className="text-[10.5px] font-normal text-status-success-label">
                    Suggested
                  </span>
                ) : null}
              </p>
              <p className="m-0 my-0.5 text-lg font-medium text-text">{formatInr(tier.amountInr)}</p>
              <p
                className={`m-0 text-[11.5px] leading-[1.45] ${
                  featured ? "text-status-success-text" : "text-text-muted"
                }`}
              >
                {tier.perk}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
