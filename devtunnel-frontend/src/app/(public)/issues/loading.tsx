import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintListPageHeader,
  BlueprintIssueInsightsCard,
  BlueprintPublicFilterBar,
  BlueprintTaskCardList,
  BlueprintListPagination,
} from "@/components/ui/blueprint-kit";
import { BlueprintIssueListBar } from "@/components/ui/blueprint-issues";

/**
 * Next.js route-segment loading boundary for `/issues` ("All Issues").
 *
 * The sheet is the page the visitor is about to get, top to bottom: the
 * real title and subtitle, `IssuesExplorer`'s "Issue insights" card, its
 * filter stack (search, "Match my profile", State / Repository / Author /
 * Tech stack / Project, `mb-3`), the "Showing the N most recently
 * updated…" / "Load all issues" bar, the `IssuesTable` cards and the
 * pagination footer.
 *
 * Both states draw that same shape. This used to swap the whole list for
 * a dashed "Scanning…" notice while `getIssues()` was running, which made
 * the sheet look nothing like the page and shifted the layout when it
 * resolved. The scan is still announced — in the `Rev` label on the
 * sheet and in a screen-reader-only status line — it just no longer
 * replaces the page's shape.
 */
export function IssuesLoadingSheet({ scanning = true }: { scanning?: boolean }) {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 08 — Issues"
      revLabel={scanning ? "Rev — scanning repositories" : "Rev — scan complete"}
      contentClassName="mx-auto w-full max-w-6xl px-6 py-10"
      ariaHidden={!scanning}
    >
      {scanning ? (
        <p role="status" className="sr-only">
          Scanning DevTunnel&apos;s projects for open GitHub issues. This checks every onboarded
          repo live, so larger project lists can take a little while.
        </p>
      ) : null}
      <BlueprintListPageHeader
        title="All Issues"
        description="Every open GitHub issue across DevTunnel's onboarded projects — search or filter to find something to work on."
      />
      <BlueprintIssueInsightsCard />
      <BlueprintPublicFilterBar
        labels={["State", "Repository", "Author", "Tech stack", "Project"]}
        withMatchProfile
        bottomMarginClassName="mb-3"
      />
      <BlueprintIssueListBar />
      <BlueprintTaskCardList rows={6} variant="issue" />
      <BlueprintListPagination itemLabel="issue" />
    </BlueprintSheet>
  );
}

export default function IssuesLoading() {
  return <IssuesLoadingSheet />;
}
