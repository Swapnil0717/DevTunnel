import { Spinner } from "@/components/ui/spinner";
import type {
  CreatedProject,
  ProjectOnboardingStepState,
  ProjectOnboardingValidationResult,
} from "@/lib/admin/project-onboarding/types";

interface ValidationStepProps {
  steps: ProjectOnboardingStepState;
  validation: ProjectOnboardingValidationResult | null;
  isValidating: boolean;
  isCreating: boolean;
  createError: string | null;
  createdProject: CreatedProject | null;
  onCreate: () => void;
}

const CHECKLIST: { key: keyof ProjectOnboardingStepState; label: string }[] = [
  { key: "repositoryCompleted", label: "Repository" },
  { key: "descriptionCompleted", label: "Description" },
  { key: "techStackCompleted", label: "Tech stack" },
  { key: "previewCompleted", label: "Preview" },
];

export function ValidationStep({
  steps,
  validation,
  isValidating,
  isCreating,
  createError,
  createdProject,
  onCreate,
}: ValidationStepProps) {
  if (createdProject) {
    return (
      <div className="rounded-[10px] border border-status-success-border bg-status-success-bg p-6">
        <p className="m-0 mb-1.5 text-[15px] font-medium text-status-success-label">
          Project created
        </p>
        <p className="m-0 text-[13px] leading-[1.6] text-status-success-text">
          <strong className="text-text">{createdProject.name}</strong> is now
          an active DevTunnel project. It will appear on the All Projects
          page once that page ships.
        </p>
      </div>
    );
  }

  const allStepsDone = CHECKLIST.every((item) => steps[item.key]);

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Final validation</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        One last checkpoint before this becomes an active DevTunnel
        project.
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
            This draft isn&apos;t ready yet
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
        className="flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isValidating || isCreating ? <Spinner size={13} /> : null}
        {isValidating
          ? "Validating…"
          : isCreating
            ? "Creating project…"
            : "Create / Import Project"}
      </button>
    </div>
  );
}