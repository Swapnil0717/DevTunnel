import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintListPageHeader,
  BlueprintPublicFilterBar,
  BlueprintTaskCardList,
  BlueprintListPagination,
} from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for `/tasks` ("Tasks").
 *
 * A blueprint sheet, not a spinner: `getTasks()` reads `GET /tasks` — a
 * cheap, indexed query — so a fixed-shape skeleton that matches the real
 * layout is the honest signal here (unlike `/issues`, whose backend call
 * re-scans GitHub live).
 *
 * Every piece mirrors the real page, element for element:
 *  - the page heading: the real "Tasks" title and subtitle, ghosted, so
 *    the subtitle wraps onto the same number of lines;
 *  - `TasksExplorer`'s filter stack (`mb-3`): search, "Match my profile",
 *    then the five labelled selects — Role, Difficulty, Tech stack,
 *    Project, Status — each label at its real width;
 *  - `TasksTable`'s cards: title + status, project / repository / issue
 *    line, chips, and the counts + Explain + "View task →" footer;
 *  - `PagePaginationControls`' "Showing 1–10 of N tasks" footer.
 */
export default function TasksLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 07 — Tasks"
      revLabel="Rev — loading tasks"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintListPageHeader
        title="Tasks"
        description="Every task DevTunnel currently provides to contributors — search or filter by role, difficulty, tech stack, or project to find something to work on."
      />
      <BlueprintPublicFilterBar
        labels={["Role", "Difficulty", "Tech stack", "Project", "Status"]}
        withMatchProfile
        bottomMarginClassName="mb-3"
      />
      <BlueprintTaskCardList rows={6} variant="task" />
      <BlueprintListPagination itemLabel="task" />
    </BlueprintSheet>
  );
}
