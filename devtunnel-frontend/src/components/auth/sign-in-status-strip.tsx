export type SignInState = "idle" | "redirecting" | "error";

const STATE_COPY: Record<
  SignInState,
  { label: string; description: string; dotColor: string }
> = {
  idle: {
    label: "idle",
    description: "Waiting for GitHub",
    dotColor: "bg-status-idle",
  },
  redirecting: {
    label: "loading",
    description: "Redirecting to GitHub…",
    dotColor: "bg-status-loading",
  },
  error: {
    label: "error",
    description: "Access was denied",
    dotColor: "bg-status-error",
  },
};

/**
 * Mirrors the three status tiles from the approved login design, but now
 * reflects the page's real sign-in state instead of being decorative.
 * `errorDescription` lets the callback page surface the backend's actual
 * error message instead of the generic default.
 */
export function SignInStatusStrip({
  state,
  errorDescription,
}: {
  state: SignInState;
  errorDescription?: string;
}) {
  const copy = STATE_COPY[state];
  const isError = state === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full max-w-[340px] rounded-chip border px-4 py-3 ${
        isError ? "border-border-error bg-surface-error" : "border-border bg-surface-1"
      }`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${copy.dotColor}`} aria-hidden="true" />
        <span
          className={`font-mono text-[11px] ${isError ? "text-status-errorText" : "text-ink-muted"}`}
        >
          {copy.label}
        </span>
      </div>
      <p className={`text-xs ${isError ? "text-status-errorMuted" : "text-ink-secondary"}`}>
        {isError ? errorDescription ?? copy.description : copy.description}
      </p>
    </div>
  );
}
