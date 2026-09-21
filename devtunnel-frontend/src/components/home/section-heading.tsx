import Link from "next/link";
import { ArrowRightIcon } from "@/components/layout/nav-icons";

/**
 * The heading row shared by every Home section: an `<h2>` on the left and,
 * when the section has somewhere to go, a "See all →" link on the right
 * (baseline-aligned, as in the design).
 *
 * Several sections carry an identical "See all" link, so `linkLabel` gives
 * each one a distinct accessible name ("See all recommended projects") —
 * the visible text stays the design's short "See all". Each accessible name
 * still starts with the visible text, so voice-control users can say what
 * they see.
 *
 * Server component — no client JS needed for a heading and a link
 * (rule 38).
 */
export function SectionHeading({
  id,
  title,
  href,
  linkLabel,
}: {
  id: string;
  title: string;
  href?: string;
  /** Accessible name for the link, e.g. "See all your tasks". Defaults to "See all". */
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex min-h-5 items-baseline justify-between gap-3">
      <h2 id={id} className="m-0 text-[13px] font-medium text-text">
        {title}
      </h2>
      {href ? (
        <Link
          href={href}
          aria-label={linkLabel}
          className="inline-flex items-center gap-1 text-[12px] text-text-dim transition-colors hover:text-accent"
        >
          See all
          <ArrowRightIcon className="h-[13px] w-[13px]" />
        </Link>
      ) : null}
    </div>
  );
}
