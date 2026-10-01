import { Suspense } from "react";
import { RecommendedTasksList } from "./recommended-tasks-list";
import { MyTasksList } from "./my-tasks-list";
import { HomeListSkeleton } from "./home-list-skeleton";
import { SectionHeading } from "./section-heading";
import { HOME_TASKS_GRID } from "./styles";
import { HOME_MY_TASKS_LIMIT, HOME_RECOMMENDED_TASKS_LIMIT } from "@/lib/home/limits";

/**
 * Recommended tasks and Your tasks, side by side — `HOME_TASKS_GRID` (two
 * columns when there's room, one otherwise; shared with the loading skeleton).
 */
export function TasksSection() {
  return (
    <div className={`mb-9 ${HOME_TASKS_GRID}`}>
      <section aria-labelledby="recommended-tasks-heading">
        <SectionHeading id="recommended-tasks-heading" title="Recommended tasks" />
        <Suspense
          fallback={
            <HomeListSkeleton rows={HOME_RECOMMENDED_TASKS_LIMIT} variant="recommended" />
          }
        >
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
        <Suspense fallback={<HomeListSkeleton rows={HOME_MY_TASKS_LIMIT} variant="mine" />}>
          <MyTasksList />
        </Suspense>
      </section>
    </div>
  );
}
