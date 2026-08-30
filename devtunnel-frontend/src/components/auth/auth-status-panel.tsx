import { StatusDot } from "@/components/ui/status-dot";

export type LoginStatus = "idle" | "loading" | "error";

interface AuthStatusPanelProps {
  status: LoginStatus;
  /** Human-readable reason, shown only when `status === "error"`. */
  errorMessage?: string;
}

const STATUS_COPY: Record<LoginStatus, { label: string; description: string }> = {
  idle: { label: "idle", description: "Waiting for GitHub" },
  loading: { label: "loading", description: "Redirecting to GitHub…" },
  error: { label: "error", description: "Access was denied" },
};

/**
 * Reflects the real, current state of the sign-in flow (never a static
 * showcase of every possible state at once) — see rule 23: indexable/visible
 * content must be meaningful, and rule 49: don't fabricate dynamic content.
 */
export function AuthStatusPanel({ status, errorMessage }: AuthStatusPanelProps) {
  const isError = status === "error";
  const copy = STATUS_COPY[status];
  const description = isError && errorMessage ? errorMessage : copy.description;

  const dotColor =
    status === "idle" ? "#639922" : status === "loading" ? "#378ADD" : "#E24B4A";

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        isError
          ? "rounded-lg border border-status-error-border bg-status-error-bg px-[14px] py-3"
          : "rounded-lg border border-border bg-surface px-[14px] py-3"
      }
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <StatusDot color={dotColor} />
        <span
          className={`font-mono text-[11px] ${
            isError ? "text-status-error-label" : "text-text-muted"
          }`}
        >
          {copy.label}
        </span>
      </div>
      <p
        className={`m-0 text-xs ${
          isError ? "text-status-error-text" : "text-[#B5B5B5]"
        }`}
      >
        {description}
      </p>
    </div>
  );
}
