import Link from "next/link";
import { Suspense } from "react";
import { ActiveProjectsList } from "./active-projects-list";
import { ListSkeleton } from "./list-skeleton";

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
          href="/projects?filter=active"
          className="text-[11px] text-text-faint hover:text-accent"
        >
          See all
        </Link>
      </div>
      <Suspense fallback={<ListSkeleton rows={2} />}>
        <ActiveProjectsList />
      </Suspense>
    </section>
  );
}