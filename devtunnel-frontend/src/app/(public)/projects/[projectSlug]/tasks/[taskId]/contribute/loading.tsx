import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintBackLink,
  BlueprintBreadcrumb,
  BlueprintHeaderButton,
  BlueprintTaskHeader,
  BlueprintTaskTracker,
  BlueprintContributeTaskSummary,
  BlueprintTaskAiCard,
  BlueprintContributeCliSection,
  BlueprintContributeManualSection,
  BlueprintContributeSidebar,
} from "@/components/ui/blueprint-kit";

/**
 * Route-segment loading boundary for
 * `/projects/:projectSlug/tasks/:taskId/contribute`.
 *
 * Mirrors `TaskContributePage` in order: "Back to task" link, the
 * three-part `Tasks / title / Contribute` breadcrumb, the title row
 * ("Contribute to this task", project / repository / status, and the
 * "Task overview" + "View issue #n" buttons), then the main column —
 * progress tracker, "The task" summary, the AI card, the numbered CLI
 * steps and the eight-step manual Git flow — beside the shared contribute
 * rail (`ContributeSidebar`).
 *
 * Drawn for a task that can still be started; for a finished or
 * claimed-by-someone-else task the real page swaps the AI card and the
 * two step cards for one short message.
 */
export default function TaskContributeLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 05.4 — Task guide"
      revLabel="Rev — loading guide"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintBackLink text="Back to task" />
      <BlueprintBreadcrumb text="Tasks / Task title that describes the work to be done / Contribute" />

      <BlueprintTaskHeader
        title="Contribute to this task"
        buttons={
          <>
            <BlueprintHeaderButton label="Task overview" icon={false} />
            <BlueprintHeaderButton label="View issue #1234" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <BlueprintTaskTracker />
          <BlueprintContributeTaskSummary />
          <BlueprintTaskAiCard variant="contribute" />
          <BlueprintContributeCliSection />
          <BlueprintContributeManualSection />
        </div>
        <BlueprintContributeSidebar />
      </div>
    </BlueprintSheet>
  );
}
