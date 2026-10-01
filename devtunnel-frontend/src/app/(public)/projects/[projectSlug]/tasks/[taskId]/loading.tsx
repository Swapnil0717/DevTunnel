import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import {
  BlueprintBackLink,
  BlueprintBreadcrumb,
  BlueprintHeaderButton,
  BlueprintTaskHeader,
  BlueprintTaskTracker,
  BlueprintTaskProjectSection,
  BlueprintTaskDescriptionSection,
  BlueprintTaskAiCard,
  BlueprintTaskIssueSection,
  BlueprintTaskSidebar,
} from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for
 * `/projects/:projectSlug/tasks/:taskId`.
 *
 * Mirrors `TaskDetailPage` top to bottom, in the same order and with the
 * same spacing: "Back to Tasks" link, `Tasks / title` breadcrumb, the
 * title row (project, repository link, status word; "Contribute to this
 * task" and "View issue #n" buttons), the `TaskProgressTracker` card
 * (`mb-6`), then the two-column body — About the project, Task
 * description, the "Explain this task" AI card and the Issue description
 * on the left; the Details / Tech stack rail on the right.
 *
 * Shown for the common case (a task with a linked open issue and a
 * project that loaded); the real page drops the AI card and the issue
 * button for a task without an open issue.
 */
export default function TaskDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 05.3 — Task"
      revLabel="Rev — loading task"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintBackLink text="Back to Tasks" />
      <BlueprintBreadcrumb text="Tasks / Task title that describes the work to be done" />

      <BlueprintTaskHeader
        title="Task title that describes the work to be done"
        buttons={
          <>
            <BlueprintHeaderButton label="Contribute to this task" bordered={false} />
            <BlueprintHeaderButton label="View issue #1234" />
          </>
        }
      />

      <div className="mb-6">
        <BlueprintTaskTracker />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-6">
          <BlueprintTaskProjectSection />
          <BlueprintTaskDescriptionSection />
          <BlueprintTaskAiCard variant="view" />
          <BlueprintTaskIssueSection />
        </div>
        <BlueprintTaskSidebar />
      </div>
    </BlueprintSheet>
  );
}
