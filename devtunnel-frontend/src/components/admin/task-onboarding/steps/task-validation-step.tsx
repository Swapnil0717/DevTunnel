import type {
    CreatedTask,
    TaskOnboardingStepState,
    TaskOnboardingValidationResult,
  } from "@/lib/admin/task-onboarding/types";
  
  interface TaskValidationStepProps {
    steps: TaskOnboardingStepState;
    validation: TaskOnboardingValidationResult | null;
    isValidating: boolean;
    isCreating: boolean;
    createError: string | null;
    createdTask: CreatedTask | null;
    onCreate: () => void;
  }
  
  const CHECKLIST: { key: keyof TaskOnboardingStepState; label: string }[] = [
    { key: "projectSelected", label: "Project" },
    { key: "issueSelected", label: "GitHub issue" },
    { key: "issueInformationCompleted", label: "Issue information" },
    { key: "techStackLoaded", label: "Tech stack" },
    { key: "difficultyDefined", label: "Role & difficulty" },
    { key: "previewCompleted", label: "Preview" },
  ];
  
  /**
   * Final Validation of Task Onboarding (admin_workflow.txt, section 11 —
   * "Task Final Validation"; section 12 — "Task Creation Algorithm").
   *
   * The checklist reflects `draft.steps` exactly as returned by the
   * backend — never a locally-computed guess (section 25: task onboarding
   * state is backend-authoritative, same as Project Onboarding). "Create
   * Task" calls `POST .../:id/complete`, which the backend rejects outright
   * if any step isn't actually done — this component surfaces that
   * rejection as `createError` rather than assuming the click always
   * succeeds.
   */
  export function TaskValidationStep({
    steps,
    validation,
    isValidating,
    isCreating,
    createError,
    createdTask,
    onCreate,
  }: TaskValidationStepProps) {
    if (createdTask) {
      return (
        <div className="rounded-[10px] border border-status-success-border bg-status-success-bg p-6">
          <p className="m-0 mb-1.5 text-[15px] font-medium text-status-success-label">
            Task created
          </p>
          <p className="m-0 text-[13px] leading-[1.6] text-status-success-text">
            <strong className="text-text">{createdTask.title}</strong> is now
            available to DevTunnel contributors on{" "}
            <span className="font-mono text-text">{createdTask.projectSlug}</span>.
          </p>
        </div>
      );
    }
  
    const allStepsDone = CHECKLIST.every((item) => steps[item.key]);
  
    return (
      <div>
        <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Final validation</h1>
        <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
          One last checkpoint before this task becomes available to
          contributors.
        </p>
  
        <ul className="m-0 mb-6 flex list-none flex-col gap-2 p-0">
          {CHECKLIST.map((item) => {
            const done = steps[item.key];
            return (
              <li
                key={item.key}
                className="flex items-center justify-between rounded-md border border-border bg-surface px-3.5 py-2.5 text-[13px]"
              >
                <span className="text-text">{item.label}</span>
                <span
                  className={`text-[12px] font-medium ${
                    done ? "text-status-success-label" : "text-text-faint"
                  }`}
                >
                  {done ? "✓ Ready" : "Incomplete"}
                </span>
              </li>
            );
          })}
        </ul>
  
        {validation && !validation.valid ? (
          <div
            role="alert"
            className="mb-6 rounded-md border border-status-error-border bg-status-error-bg px-3.5 py-3"
          >
            <p className="m-0 mb-1 text-[12.5px] font-medium text-status-error-label">
              This task isn&apos;t ready yet
            </p>
            <ul className="m-0 list-disc pl-4 text-[12px] text-status-error-text">
              {validation.issues.map((issue) => (
                <li key={`${issue.step}-${issue.message}`}>{issue.message}</li>
              ))}
            </ul>
          </div>
        ) : null}
  
        {createError ? (
          <p role="alert" className="m-0 mb-4 text-[12.5px] text-status-error-label">
            {createError}
          </p>
        ) : null}
  
        <button
          type="button"
          onClick={onCreate}
          disabled={!allStepsDone || isValidating || isCreating}
          className="rounded-md bg-accent px-5 py-2.5 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isValidating ? "Validating…" : isCreating ? "Creating task…" : "Create Task"}
        </button>
      </div>
    );
  }