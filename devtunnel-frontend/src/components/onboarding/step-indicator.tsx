interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  /** "horizontal" = compact "step X of N" bar (mobile top strip).
   *  "vertical" = numbered rail with labels/descriptions (laptop sidebar). */
  orientation?: "horizontal" | "vertical";
  labels?: string[];
  descriptions?: string[];
}

/**
 * "step X of N" progress header shared by every onboarding step
 * (3_devtunnel_onboarding.html). Always reflects the wizard's real,
 * current step — never a static decoration — per
 * Frontend_Development_Rules.txt rule 43 (keep important facts explicit)
 * and rule 47 (don't fake progress/freshness).
 *
 * Two renderings of the same state: a compact horizontal bar for the
 * mobile top strip, and a vertical numbered rail (with connecting line,
 * labels, and descriptions) for the laptop sidebar. Both are driven by
 * the same `currentStep`/`totalSteps` props, so neither can drift out of
 * sync with the other.
 */
export function StepIndicator({
  currentStep,
  totalSteps,
  orientation = "horizontal",
  labels,
  descriptions,
}: StepIndicatorProps) {
  if (orientation === "vertical") {
    return (
      <ol aria-label="Onboarding steps" className="m-0 flex list-none flex-col p-0">
        {Array.from({ length: totalSteps }, (_, index) => {
          const stepNumber = index + 1;
          const isComplete = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <li
              key={stepNumber}
              aria-current={isCurrent ? "step" : undefined}
              className="flex gap-3 pb-7 last:pb-0"
            >
              <div className="flex flex-col items-center">
                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border text-[11px] font-medium ${
                    isComplete
                      ? "border-accent bg-accent text-accent-foreground"
                      : isCurrent
                        ? "border-accent text-status-success-label"
                        : "border-border text-text-faint"
                  }`}
                >
                  {isComplete ? "✓" : stepNumber}
                </span>
                {stepNumber < totalSteps ? (
                  <span
                    aria-hidden="true"
                    className={`mt-1 w-px flex-1 ${isComplete ? "bg-accent" : "bg-border"}`}
                  />
                ) : null}
              </div>
              <div className="pt-0.5">
                <p
                  className={`m-0 text-[13px] font-medium ${
                    isCurrent ? "text-text" : isComplete ? "text-text-muted" : "text-text-dim"
                  }`}
                >
                  {labels?.[index] ?? `Step ${stepNumber}`}
                  {isCurrent ? <span className="sr-only"> (current step)</span> : null}
                  {isComplete ? <span className="sr-only"> (completed)</span> : null}
                </p>
                {descriptions?.[index] ? (
                  <p className="m-0 mt-0.5 max-w-[220px] text-[11.5px] leading-[1.5] text-text-faint">
                    {descriptions[index]}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] text-text-faint">
        step {currentStep} of {totalSteps}
      </span>
      <div className="flex gap-1" role="presentation">
        {Array.from({ length: totalSteps }, (_, index) => (
          <div
            key={index}
            className={`h-[3px] w-[22px] rounded-sm ${
              index < currentStep ? "bg-status-success-label" : "bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}