/**
 * The manual fork → branch → change → commit → push → pull request flow,
 * specialised for **one task** on `/projects/:projectSlug/tasks/:taskId/contribute`.
 *
 * Nothing new is invented here. `buildWorkflowSteps` already produces the
 * real, repository-specific steps for the project-level Contribute page;
 * a task page only knows one extra fact that page never does — the number
 * of the GitHub issue this task was onboarded from. So this wraps the
 * shared builder and fills in the `<issue-number>` placeholder in the
 * commit step with that real number, instead of maintaining a second,
 * near-identical list of steps that would drift from the first
 * (Frontend_Development_Rules.txt rule 51).
 *
 * The placeholders DevTunnel genuinely can't know (`<your-username>`,
 * `<branch-name>`, `<what changed>`) are left visible, for the same reason
 * `workflow-steps.ts` leaves them: a guessed value would look copyable and
 * then fail (rule 58).
 *
 * Returns `null` when the project has no repository URL/full name — same
 * contract as `buildWorkflowSteps`.
 */

import { buildWorkflowSteps } from "@/lib/contribute/workflow-steps";
import type { WorkflowStep } from "@/lib/contribute/types";

export function buildTaskWorkflowSteps({
  repositoryUrl,
  repositoryFullName,
  issueNumber,
}: {
  repositoryUrl: string | null;
  repositoryFullName: string | null;
  /** The linked GitHub issue's number, or `null` for a task with no linked issue. */
  issueNumber: number | null;
}): WorkflowStep[] | null {
  const steps = buildWorkflowSteps({
    repositoryUrl,
    repositoryFullName,
    cloneUrl: repositoryUrl ? `${repositoryUrl}.git` : null,
  });

  if (!steps) return null;
  if (issueNumber === null) return steps;

  return steps.map((step) => ({
    ...step,
    commands: step.commands?.map((command) =>
      command.replace("<issue-number>", String(issueNumber)),
    ),
  }));
}
