import { Suspense } from "react";
import { RecommendedTasksList } from "./recommended-tasks-list";
import { MyTasksList } from "./my-tasks-list";
import { HomeListSkeleton } from "./home-list-skeleton";
import { SectionHeading } from "./section-heading";

/**
 * Recommended tasks and Your tasks, side by side. `auto-fit` with a 340px
 * minimum, as in the design — two columns when there's room, one otherwise.
 * The `min(340px, 100%)` keeps the single column from overflowing a phone
 * narrower than 340px.
 */
export function TasksSection() {
  return (
    <div className="mb-9 grid grid-cols-[repeat(auto-fit,minmax(min(340px,100%),1fr))] gap-x-5 gap-y-7">
      <section aria-labelledby="recommended-tasks-heading">
        <SectionHeading id="recommended-tasks-heading" title="Recommended tasks" />
        <Suspense fallback={<HomeListSkeleton rows={3} />}>
          <RecommendedTasksList />
        </Suspense>
      </section>

      <section aria-labelledby="my-tasks-heading">
        <SectionHeading
          id="my-tasks-heading"
          title="Your tasks"
          href="/tasks?filter=mine"
          linkLabel="See all your tasks"
        />
        <Suspense fallback={<HomeListSkeleton rows={3} />}>
          <MyTasksList />
        </Suspense>
      </section>
    </div>
  );
}
