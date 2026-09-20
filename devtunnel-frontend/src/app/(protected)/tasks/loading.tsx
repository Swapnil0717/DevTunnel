import { SkeletonPageHeader, SkeletonFilterBar, SkeletonTable } from "@/components/ui/skeleton";

/**
 * Next.js route-segment loading boundary for `/tasks` ("Tasks").
 *
 * A shimmer skeleton, not a spinner: unlike `/issues`
 * (`app/(protected)/issues/loading.tsx`), `getTasks()` reads
 * `GET /tasks` — a cheap, indexed query over `devtunnel.tasks`, not a
 * live cross-repository GitHub scan — so a fixed-shape skeleton that
 * matches the real layout is the honest signal here, same convention
 * `/admin/tasks/loading.tsx` already uses for the same reason.
 *
 * No header action placeholder (`withAction` left at its skeleton
 * default false via omission — see below) since the real page has none:
 * unlike the Admin Tasks page's "Create task" button, this page is
 * read-only browsing, so its header is just a title + subtitle.
 * 5 filters matches `TasksExplorer`'s real filter bar (Role, Difficulty,
 * Tech stack, Project, Status).
 */
export default function TasksLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10" aria-hidden="true">
      <SkeletonPageHeader withAction={false} />
      <SkeletonFilterBar filters={5} />
      <SkeletonTable rows={10} columns={9} />
    </main>
  );
}