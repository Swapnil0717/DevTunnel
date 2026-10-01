import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintPageHeader,
  BlueprintPublicFilterBar,
  BlueprintTaskCardList,
  BlueprintPagination,
} from "@/components/ui/blueprint-kit";

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
 * default false via omission) since the real page has none: unlike the
 * Admin Tasks page's "Create task" button, this page is read-only
 * browsing, so its header is just a title + subtitle.
 *
 * The filter bar uses `BlueprintPublicFilterBar`, not the admin
 * side-by-side `BlueprintFilterBar`: `TasksExplorer` stacks its search
 * box, an optional "Match my profile" row, then a wrapped row of 5
 * label-over-select filters (Role, Difficulty, Tech stack, Project,
 * Status) — and its wrapper is `mb-3`, not the `mb-4` the card-grid
 * pages use. `TasksTable` is a list of task cards (no columns), so the
 * skeleton is `BlueprintTaskCardList` — same card shape and spacing — and a
 * `BlueprintPagination` footer matches the real `PagePaginationControls`
 * under the list.
 */
export default function TasksLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 07 — Tasks"
      revLabel="Rev — loading tasks"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader withAction={false} />
      <BlueprintPublicFilterBar filters={5} withMatchProfile bottomMarginClassName="mb-3" />
      <BlueprintTaskCardList rows={6} />
      <BlueprintPagination />
    </BlueprintSheet>
  );
}
