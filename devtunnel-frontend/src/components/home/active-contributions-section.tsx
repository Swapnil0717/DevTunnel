import { Suspense } from "react";
import { RecentActivityList } from "./recent-activity-list";
import { HomeListSkeleton } from "./home-list-skeleton";
import { SectionHeading } from "./section-heading";

/**
 * "Recently active" — the contributor's own recent DevTunnel activity. "See
 * all" goes to the profile, whose Contribution history is the full record; it
 * used to point at `/projects?filter=active`, a filter no page reads.
 */
export function ActiveContributionsSection() {
  return (
    <section aria-labelledby="active-contributions-heading">
      <SectionHeading
        id="active-contributions-heading"
        title="Recently active"
        href="/profile"
        linkLabel="See all recent activity"
      />
      <Suspense fallback={<HomeListSkeleton rows={4} />}>
        <RecentActivityList />
      </Suspense>
    </section>
  );
}
