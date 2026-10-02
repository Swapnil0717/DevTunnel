import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintBackLink,
  BlueprintBreadcrumb,
  BlueprintHeaderButton,
  BlueprintTaskHeader,
  BlueprintTaskProjectSection,
  BlueprintTaskAiCard,
  BlueprintTaskIssueSection,
  BlueprintTaskSidebar,
} from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for
 * `/issues/:projectSlug/:issueNumber`.
 *
 * Mirrors `IssueDetailPage` top to bottom, in the same order and with the
 * same spacing: "Back to Issues" link, `Issues / title` breadcrumb, the
 * title row ("Contribute to this issue" and "View issue #n" buttons), then
 * the two-column body — About the project, the "Explain this issue" AI card
 * and the Issue description on the left; the Details / Tech stack rail on
 * the right.
 *
 * Reuses the task page's blueprint pieces rather than adding near-identical
 * ones: the page itself reuses `TaskProjectSection`, `TaskIssueSection` and
 * a task-shaped rail, so these are the same shapes. Drawn for the common
 * case (an open issue with no DevTunnel task); the real page adds a notice
 * row when a task exists and drops the AI card for a closed issue.
 */
export default function IssueDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 08.1 — Issue"
      revLabel="Rev — loading issue"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintBackLink text="Back to Issues" />
      <BlueprintBreadcrumb text="Issues / Issue title that describes the problem to be solved" />

      <BlueprintTaskHeader
        title="Issue title that describes the problem to be solved"
        buttons={
          <>
            <BlueprintHeaderButton label="Contribute to this issue" bordered={false} />
            <BlueprintHeaderButton label="View issue #1234" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <BlueprintTaskProjectSection />
          <BlueprintTaskAiCard variant="view" />
          <BlueprintTaskIssueSection />
        </div>
        <BlueprintTaskSidebar />
      </div>
    </BlueprintSheet>
  );
}
