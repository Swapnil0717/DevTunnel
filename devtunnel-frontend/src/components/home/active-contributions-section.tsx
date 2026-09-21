import Link from "next/link";
import { Suspense } from "react";
import { RecentActivityList } from "./recent-activity-list";
import { ListSkeleton } from "./list-skeleton";

/**
 * "Recently active" — the contributor's own recent DevTunnel activity. "See
 * all" goes to the profile, whose Contribution history is the full record;
 * it used to point at `/projects?filter=active`, a filter no page reads.
 */
export function ActiveContributionsSection() {
  return (
    <section aria-labelledby="active-contributions-heading" className="mb-5">
      <div className="flex items-center justify-between mb-2.5">
        <h2
          id="active-contributions-heading"
          className="text-[12.5px] font-normal text-text-muted"
        >
          Recently active
        </h2>
        <Link
          href="/profile"
          className="text-[11px] text-text-faint hover:text-accent"
        >
          See all
        </Link>
      </div>
      <Suspense fallback={<ListSkeleton rows={2} />}>
        <RecentActivityList />
      </Suspense>
    </section>
  );
}