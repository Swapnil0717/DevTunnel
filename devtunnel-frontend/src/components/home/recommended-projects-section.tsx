import Link from "next/link";
import { Suspense } from "react";
import { RecommendedProjectsList } from "./recommended-projects-list";
import { ProjectGridSkeleton } from "./project-grid-skeleton";

export function RecommendedProjectsSection() {
  return (
    <section aria-labelledby="recommended-projects-heading" className="mb-5">
      <div className="flex items-center justify-between mb-2.5">
        <h2
          id="recommended-projects-heading"
          className="text-[12.5px] font-normal text-text-muted"
        >
          Recommended for you
        </h2>
        <Link
          href="/projects?recommended=true"
          className="text-[11px] text-text-faint hover:text-accent"
        >
          See all
        </Link>
      </div>
      <Suspense fallback={<ProjectGridSkeleton count={3} />}>
        <RecommendedProjectsList />
      </Suspense>
    </section>
  );
}