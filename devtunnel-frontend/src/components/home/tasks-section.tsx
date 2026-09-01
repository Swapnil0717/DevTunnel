import Link from "next/link";
import { Suspense } from "react";
import { RecommendedTasksList } from "./recommended-tasks-list";
import { MyTasksList } from "./my-tasks-list";
import { ListSkeleton } from "./list-skeleton";

export function TasksSection() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <section aria-labelledby="recommended-tasks-heading">
        <h2
          id="recommended-tasks-heading"
          className="block text-[12.5px] text-text-muted mb-2.5"
        >
          Recommended tasks
        </h2>
        <Suspense fallback={<ListSkeleton rows={2} />}>
          <RecommendedTasksList />
        </Suspense>
      </section>

      <section aria-labelledby="my-tasks-heading">
        <div className="flex items-center justify-between mb-2.5">
          <h2 id="my-tasks-heading" className="text-[12.5px] text-text-muted">
            Your active tasks
          </h2>
          <Link
            href="/tasks?filter=mine"
            className="text-[11px] text-text-faint hover:text-accent"
          >
            See all
          </Link>
        </div>
        <Suspense fallback={<ListSkeleton rows={2} />}>
          <MyTasksList />
        </Suspense>
      </section>
    </div>
  );
}