// devtunnel-frontend/src/components/sponsors/sponsor-wall.tsx
import {
  SPONSORS,
  formatInr,
  sortedSponsors,
  sponsorProfileUrl,
  tierName,
  type Sponsor,
  type SponsorTierId,
} from "@/lib/sponsors/sponsors";
import { SparkleIcon } from "@/components/layout/nav-icons";

const TIER_BADGE: Record<SponsorTierId, string> = {
  champion: "border-tag-skill-border bg-tag-skill-bg text-tag-skill-text",
  backer: "border-tag-tech-border bg-tag-tech-bg text-tag-tech-text",
  supporter: "border-border bg-surface-raised text-text-muted",
};

function SponsorRow({ sponsor }: { sponsor: Sponsor }) {
  const displayName = sponsor.name?.trim() || "Anonymous";
  const isAnonymous = displayName === "Anonymous" && !sponsor.name?.trim();
  const profileUrl = sponsorProfileUrl(sponsor);

  return (
    <li className="flex items-center gap-2.5 border-b border-border-subtle py-2 last:border-b-0">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-avatar-placeholder-border bg-avatar-placeholder-bg text-[11px] font-medium text-avatar-placeholder-icon"
      >
        {isAnonymous ? "?" : displayName.charAt(0).toUpperCase()}
      </span>

      <span className="min-w-0 flex-1 truncate text-[13px] text-text">
        {profileUrl ? (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {displayName}
            <span className="sr-only"> (GitHub profile, opens in a new tab)</span>
          </a>
        ) : (
          displayName
        )}
      </span>

      <span
        className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] ${TIER_BADGE[sponsor.tier]}`}
      >
        {tierName(sponsor.tier)}
      </span>
      <span className="min-w-[72px] shrink-0 text-right text-xs text-text-secondary">
        {typeof sponsor.amountInr === "number" ? formatInr(sponsor.amountInr) : "Amount hidden"}
      </span>
    </li>
  );
}

/**
 * The sponsor wall. Reads `SPONSORS` (hand-edited, starts empty). With no
 * sponsors it shows a "Be the first sponsor" card rather than an empty list,
 * which would read as "nobody supports this". Champions are pinned to a strip
 * above the rest; everyone else follows by tier.
 */
export function SponsorWall() {
  const sponsors = sortedSponsors(SPONSORS);
  const champions = sponsors.filter((sponsor) => sponsor.tier === "champion");
  const others = sponsors.filter((sponsor) => sponsor.tier !== "champion");

  return (
    <section aria-labelledby="sponsor-wall-heading" className="border-t border-border-subtle pt-4">
      <h2 id="sponsor-wall-heading" className="m-0 mb-2 text-sm font-medium text-text">
        Our sponsors
      </h2>

      {sponsors.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-border bg-surface px-4 py-5 text-center">
          <SparkleIcon className="mx-auto h-5 w-5 text-text-muted" />
          <p className="m-0 mb-0.5 mt-1.5 text-[13.5px] font-medium text-text">Be the first sponsor</p>
          <p className="m-0 text-xs text-text-muted">Your name will appear here once you sponsor.</p>
        </div>
      ) : (
        <>
          {champions.length > 0 ? (
            <div className="mb-3 rounded-[10px] border border-tag-skill-border bg-surface px-3.5 py-1">
              <h3 className="m-0 pb-0.5 pt-2 text-[11px] font-normal uppercase tracking-wide text-text-muted">
                Champions
              </h3>
              <ul className="m-0 list-none p-0">
                {champions.map((sponsor, index) => (
                  <SponsorRow key={`champion-${index}`} sponsor={sponsor} />
                ))}
              </ul>
            </div>
          ) : null}

          {others.length > 0 ? (
            <ul className="m-0 list-none p-0">
              {others.map((sponsor, index) => (
                <SponsorRow key={`other-${index}`} sponsor={sponsor} />
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
