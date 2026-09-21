import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintPageHeader, BlueprintFilterBar, BlueprintTable } from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for `/tasks` ("Tasks").
 *
 * A blueprint sheet, not a spinner: unlike `/issues`
 * (`app/(public)/issues/loading.tsx`), `getTasks()` reads
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
    <BlueprintSheet
      sheetLabel="Sheet 07 — Tasks"
      revLabel="Rev — loading tasks"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader withAction={false} />
      <BlueprintFilterBar filters={5} />
      <BlueprintTable rows={10} columns={9} />
    </BlueprintSheet>
  );
}