import { Suspense } from "react";
import { RecommendedProjectsList } from "./recommended-projects-list";
import { ProjectGridSkeleton } from "./project-grid-skeleton";
import { SectionHeading } from "./section-heading";
import { HOME_RECOMMENDED_PROJECT_LIMIT } from "@/lib/home/recommended-projects";

export function RecommendedProjectsSection() {
  return (
    <section aria-labelledby="recommended-projects-heading" className="mb-9">
      <SectionHeading
        id="recommended-projects-heading"
        title="Recommended for you"
        href="/projects?recommended=true"
        linkLabel="See all recommended projects"
      />
      <Suspense
        fallback={<ProjectGridSkeleton count={HOME_RECOMMENDED_PROJECT_LIMIT} />}
      >
        <RecommendedProjectsList />
      </Suspense>
    </section>
  );
}
