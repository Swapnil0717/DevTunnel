import { MarkdownReadme } from "@/components/ui/markdown-readme";
import type {
  CreatedOpenSourceTool,
  ToolOnboardingDraft,
  ToolOnboardingStepState,
  ToolOnboardingValidationResult,
} from "@/lib/admin/opensource-tool-onboarding/types";

interface PreviewConfirmStepProps {
  draft: ToolOnboardingDraft;
  validation: ToolOnboardingValidationResult | null;
  isValidating: boolean;
  isCreating: boolean;
  createError: string | null;
  createdTool: CreatedOpenSourceTool | null;
  onCreate: () => void;
}

const CHECKLIST: { key: keyof ToolOnboardingStepState; label: string }[] = [
  { key: "urlCompleted", label: "Tool URL" },
  { key: "descriptionCompleted", label: "Description" },
  { key: "labelsCompleted", label: "Labels" },
  { key: "previewCompleted", label: "Preview" },
];

/**
 * Step 4 of Open Source Tool Onboarding — "Preview & Confirm".
 *
 * A single combined step by design (the original request asked for one
 * "preview and confirmation" page, unlike Project Onboarding's separate
 * Preview and Validation steps) — read-only project summary at the top,
 * the same backend-authoritative checklist pattern as
 * `ValidationStep` (components/admin/onboarding/steps/validation-step.tsx)
 * underneath, and the create action at the bottom.
 *
 * Renders straight from `draft` as re-fetched via `GET .../preview`
 * (`OpenSourceToolOnboardingWizard`'s preview-loading effect), never
 * from stale local state, so what the Admin approves here is guaranteed
 * to match what the backend actually has stored
 * (Frontend_Development_Rules.txt rule 47 — don't fake freshness).
 * Editing happens by going Back to the relevant step, not inline here.
 *
 * The checklist reflects `draft.steps` exactly as returned by the
 * backend — never a locally-computed guess (admin_workflow.txt section
 * 24: "Do not let the frontend determine whether onboarding is
 * complete. Backend should maintain the state."). "Add tool" calls
 * `POST .../complete`, which the backend is specified to reject outright
 * if any step isn't actually done — this component surfaces that
 * rejection as `createError` rather than assuming the click always
 * succeeds.
 */
export function PreviewConfirmStep({
  draft,
  validation,
  isValidating,
  isCreating,
  createError,
  createdTool,
  onCreate,
}: PreviewConfirmStepProps) {
  if (createdTool) {
    return (
      <div className="rounded-[10px] border border-status-success-border bg-status-success-bg p-6">
        <p className="m-0 mb-1.5 text-[15px] font-medium text-status-success-label">
          Tool added
        </p>
        <p className="m-0 text-[13px] leading-[1.6] text-status-success-text">
          <strong className="text-text">{createdTool.name}</strong> is now
          listed in the DevTunnel open source tools catalog.
        </p>
      </div>
    );
  }

  const { source, description, labels, steps } = draft;

  if (!source) {
    return (
      <p className="m-0 text-[12.5px] text-status-error-label">
        No tool has been imported yet — go back to Step 1.
      </p>
    );
  }

  const descriptionText =
    description?.choice === "CUSTOM" && description.customDescription
      ? description.customDescription
      : source.fetchedDescription ?? "No description set.";

  const allStepsDone = CHECKLIST.every((item) => steps[item.key]);

  return (
    <div>
      <h1 className="m-0 mb-1 text-[16px] font-medium text-text">Preview &amp; confirm</h1>
      <p className="m-0 mb-6 max-w-[520px] text-[13px] leading-[1.6] text-text-muted">
        This is exactly what will be added to the open source tools
        catalog. Go back to any step to make changes before continuing.
      </p>

      <div className="mb-6 flex flex-col gap-5">
        <section className="rounded-[10px] border border-border bg-surface p-5">
          <p className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint">Tool</p>
          <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 text-[12.5px] sm:grid-cols-[140px_1fr]">
            <dt className="text-text-muted">Name</dt>
            <dd className="m-0 text-text">{source.name}</dd>

            <dt className="text-text-muted">Project URL</dt>
            <dd className="m-0 break-all font-mono text-text">{source.url}</dd>

            <dt className="text-text-muted">Primary language</dt>
            <dd className="m-0 text-text">{source.primaryLanguage ?? "Not detected"}</dd>
          </dl>
        </section>

        <section className="rounded-[10px] border border-border bg-surface p-5">
          <p className="m-0 mb-2 text-[11px] uppercase tracking-wide text-text-faint">
            Description
          </p>
          <p className="m-0 mb-4 text-[13px] leading-[1.6] text-text">{descriptionText}</p>

          {source.readme ? (
            <>
              <p className="m-0 mb-1 text-[11px] uppercase tracking-wide text-text-faint">
                README
              </p>
              <div className="max-h-[180px] overflow-y-auto rounded-md border border-border-subtle bg-surface-raised p-3">
                <MarkdownReadme content={source.readme} />
              </div>
            </>
          ) : null}
        </section>

        <section className="rounded-[10px] border border-border bg-surface p-5">
          <p className="m-0 mb-3 text-[11px] uppercase tracking-wide text-text-faint">Labels</p>
          {labels && labels.values.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {labels.values.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-md border border-tag-interest-border bg-tag-interest-bg px-2.5 py-1 text-[11.5px] text-tag-interest-text"
                >
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <p className="m-0 text-[12px] text-text-faint">No labels added.</p>
          )}
        </section>
      </div>

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
        className="rounded-md bg-accent px-5 py-2.5 text-[13px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isValidating ? "Validating…" : isCreating ? "Adding tool…" : "Add tool"}
      </button>
    </div>
  );
}