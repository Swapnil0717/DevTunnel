// devtunnel-frontend/src/components/sponsors/sponsor-wall.tsx
import {
  formatInr,
  sortedSponsors,
  sponsorAvatarUsername,
  sponsorProfileUrl,
  tierName,
} from "@/lib/sponsors/sponsors";
import type { PublicSponsor, SponsorTierId } from "@/lib/sponsors/api";
import { SparkleIcon } from "@/components/layout/nav-icons";
import { SponsorAvatar } from "./sponsor-avatar";

const TIER_BADGE: Record<SponsorTierId, string> = {
  champion: "border-tag-skill-border bg-tag-skill-bg text-tag-skill-text",
  backer: "border-tag-tech-border bg-tag-tech-bg text-tag-tech-text",
  supporter: "border-border bg-surface-raised text-text-muted",
};

const ANONYMOUS = "Anonymous";

/** What the wall calls a sponsor: their name, or "Anonymous" when there is none (anonymous, or left blank). */
function wallName(sponsor: PublicSponsor): { text: string; isAnonymous: boolean } {
  const name = sponsor.name?.trim();
  return name ? { text: name, isAnonymous: false } : { text: ANONYMOUS, isAnonymous: true };
}

/** The sponsor's name, linked to their GitHub profile when they get one (Backer and up). */
function SponsorName({ sponsor, text }: { sponsor: PublicSponsor; text: string }) {
  const profileUrl = sponsorProfileUrl(sponsor);
  if (!profileUrl) return <>{text}</>;

  return (
    <a
      href={profileUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-sm hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {text}
      <span className="sr-only"> (GitHub profile, opens in a new tab)</span>
    </a>
  );
}

/** A Champion card in the top strip: bigger avatar, name, and the amount only if the sponsor chose to show it. */
function ChampionCard({ sponsor }: { sponsor: PublicSponsor }) {
  const { text, isAnonymous } = wallName(sponsor);

  return (
    <li className="flex items-center gap-3 rounded-[10px] border border-border-subtle bg-surface-raised px-3 py-2.5">
      <SponsorAvatar
        username={sponsorAvatarUsername(sponsor)}
        initial={isAnonymous ? "?" : text.charAt(0).toUpperCase()}
        size={40}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-text">
          <SponsorName sponsor={sponsor} text={text} />
        </span>
        <span className="block text-[11.5px] text-text-muted">
          {tierName(sponsor.tier)}
          {typeof sponsor.amountInr === "number" ? ` · ${formatInr(sponsor.amountInr)}` : ""}
        </span>
      </span>
    </li>
  );
}

function SponsorRow({ sponsor }: { sponsor: PublicSponsor }) {
  const { text, isAnonymous } = wallName(sponsor);

  return (
    <li className="flex items-center gap-2.5 border-b border-border-subtle py-2 last:border-b-0">
      <SponsorAvatar
        username={sponsorAvatarUsername(sponsor)}
        initial={isAnonymous ? "?" : text.charAt(0).toUpperCase()}
        size={28}
      />

      <span className="min-w-0 flex-1 truncate text-[13px] text-text">
        <SponsorName sponsor={sponsor} text={text} />
      </span>

      <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] ${TIER_BADGE[sponsor.tier]}`}>
        {tierName(sponsor.tier)}
      </span>
      {/* Only when the sponsor chose to show it (the API sends null otherwise). No placeholder text. */}
      {typeof sponsor.amountInr === "number" ? (
        <span className="shrink-0 text-right text-xs text-text-secondary">{formatInr(sponsor.amountInr)}</span>
      ) : null}
    </li>
  );
}

/**
 * The sponsor wall, from `GET /sponsors` (passed in by the page; the backend
 * already applied anonymity and hidden amounts). With no sponsors it shows a
 * "Be the first sponsor" card rather than an empty list, which would read as
 * "nobody supports this".
 *
 * Champions are pinned to a strip above everyone else, as cards with a larger
 * GitHub avatar. Backers get a GitHub avatar in their row; Supporters get an
 * initial. A sponsor with no name (anonymous, or left blank) is listed as
 * "Anonymous" with a "?" and no link. The amount appears only when the
 * sponsor chose to show it; otherwise nothing is rendered in its place.
 * `total` counts every sponsor on the wall, which can exceed the (up to 200)
 * rows returned.
 */
export function SponsorWall({ sponsors: list, total }: { sponsors: readonly PublicSponsor[]; total: number }) {
  const sponsors = sortedSponsors(list);
  const hiddenCount = Math.max(0, total - sponsors.length);
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
            <div className="mb-3 rounded-[10px] border border-tag-skill-border bg-surface px-3 pb-3 pt-2">
              <h3 className="m-0 pb-2 text-[11px] font-normal uppercase tracking-wide text-text-muted">Champions</h3>
              <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
                {champions.map((sponsor, index) => (
                  <ChampionCard key={`champion-${index}`} sponsor={sponsor} />
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

          {hiddenCount > 0 ? (
            <p className="m-0 mt-2 text-xs text-text-muted">
              and {hiddenCount} more {hiddenCount === 1 ? "sponsor" : "sponsors"}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
