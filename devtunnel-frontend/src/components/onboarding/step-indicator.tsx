interface StepIndicatorProps {
    currentStep: number;
    totalSteps: number;
  }
  
  /**
   * "step X of N" progress header shared by every onboarding step
   * (3_devtunnel_onboarding.html). Always reflects the wizard's real,
   * current step — never a static decoration — per
   * Frontend_Development_Rules.txt rule 43 (keep important facts explicit)
   * and rule 47 (don't fake progress/freshness).
   */
  export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
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
  