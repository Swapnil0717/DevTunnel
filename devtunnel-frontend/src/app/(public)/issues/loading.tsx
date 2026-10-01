import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintListPageHeader,
  BlueprintIssueInsightsCard,
  BlueprintPublicFilterBar,
  BlueprintLoadIssueListBar,
  BlueprintTaskCardList,
  BlueprintListPagination,
} from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for `/issues` ("All Issues").
 *
 * The sheet is the same shell the real page renders — the real title and
 * subtitle, `IssuesExplorer`'s "Issue insights" card, its filter stack
 * (search, "Match my profile", State / Repository / Author / Tech stack /
 * Project, `mb-3`) and the "Load all issues" bar — so nothing shifts when
 * `getIssues()` resolves. Only the area under that bar differs:
 *
 *  - while scanning (`scanning`), a status notice, not a skeleton list:
 *    `getIssues()` re-scans every onboarded repository on GitHub live, so
 *    a list-shaped placeholder would promise "almost done" for a wait
 *    that can genuinely take seconds. A description is the honest signal;
 *  - once the scan is done (`scanning={false}`, the `BlueprintReveal`
 *    overlay painted over the loaded page), the real card list shape —
 *    `IssuesTable` cards plus the pagination footer — so the overlay
 *    lines up with the page it's revealing.
 */
export function IssuesLoadingSheet({ scanning = true }: { scanning?: boolean }) {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 08 — Issues"
      revLabel={scanning ? "Rev — scanning repositories" : "Rev — scan complete"}
      contentClassName="mx-auto w-full max-w-6xl px-6 py-10"
      ariaHidden={!scanning}
    >
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
      {scanning ? (
        <div
          role="status"
          className="flex flex-col items-center gap-2 rounded-[4px] border border-dashed border-blueprint/40 bg-blueprint/[0.05] px-6 py-14 text-center"
        >
          <p className="m-0 text-[12.5px] text-text">
            Scanning DevTunnel&apos;s projects for open GitHub issues…
          </p>
          <p className="m-0 max-w-[420px] text-[11.5px] text-blueprint/70">
            This checks every onboarded repo live, so larger project lists can take a little
            while. Feel free to leave this tab open — it&apos;ll load automatically.
          </p>
        </div>
      ) : (
        <>
          <BlueprintLoadIssueListBar />
          <BlueprintTaskCardList rows={6} variant="issue" />
          <BlueprintListPagination itemLabel="issue" />
        </>
      )}
    </BlueprintSheet>
  );
}

export default function IssuesLoading() {
  return <IssuesLoadingSheet />;
}
