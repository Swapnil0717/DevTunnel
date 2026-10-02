import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintBackLink,
  BlueprintBreadcrumb,
  BlueprintHeaderButton,
  BlueprintTaskHeader,
  BlueprintContributeTaskSummary,
  BlueprintTaskAiCard,
  BlueprintContributeManualSection,
  BlueprintContributeSidebar,
} from "@/components/ui/blueprint-kit";

/**
 * Route-segment loading boundary for
 * `/issues/:projectSlug/:issueNumber/contribute`.
 *
 * Mirrors `IssueContributePage` in order: "Back to issue" link, the
 * three-part `Issues / title / Contribute` breadcrumb, the title row
 * ("Contribute to this issue", and the "Issue overview" + "View issue #n"
 * buttons), then the main column — "The issue" summary, the AI card and the
 * manual Git flow — beside the shared contribute rail (`ContributeSidebar`).
 *
 * Reuses the task Contribute page's blueprint pieces: the summary card, AI
 * card, manual-steps card and rail are the same shapes (the manual steps are
 * built by the same `buildTaskWorkflowSteps` the page calls, so they wrap
 * identically). Drawn for an open issue with no DevTunnel task; for a closed
 * issue or one that has a task the real page swaps the AI card and the steps
 * for one short message. The short "GitHub issue, not a DevTunnel task" note
 * between the AI card and the steps has no counterpart here, so the real
 * page is a little taller than this sheet.
 */
export default function IssueContributeLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 08.2 — Issue guide"
      revLabel="Rev — loading guide"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintBackLink text="Back to issue" />
      <BlueprintBreadcrumb text="Issues / Issue title that describes the problem to be solved / Contribute" />

      <BlueprintTaskHeader
        title="Contribute to this issue"
        buttons={
          <>
            <BlueprintHeaderButton label="Issue overview" icon={false} />
            <BlueprintHeaderButton label="View issue #1234" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <BlueprintContributeTaskSummary />
          <BlueprintTaskAiCard variant="contribute" />
          <BlueprintContributeManualSection />
        </div>
        <BlueprintContributeSidebar />
      </div>
    </BlueprintSheet>
  );
}
