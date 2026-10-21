import { StatusDot } from "@/components/ui/status-dot";
import type { LoginStatus } from "@/components/auth/auth-status-panel";

const COPY: Record<LoginStatus, { label: string; description: string }> = {
  idle: { label: "idle", description: "Waiting for GitHub" },
  loading: { label: "loading", description: "Redirecting to GitHub…" },
  error: { label: "error", description: "Access was denied" },
};

const DOT: Record<LoginStatus, string> = {
  idle: "#639922",
  loading: "#378ADD",
  error: "#E24B4A",
};

/** Real, current state of the sign-in flow, styled for the landing look. */
export function AuthStatus({
  status,
  errorMessage,
}: {
  status: LoginStatus;
  errorMessage?: string;
}) {
  const copy = COPY[status];
  const description =
    status === "error" && errorMessage ? errorMessage : copy.description;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`au-status${status === "error" ? " err" : ""}`}
    >
      <div className="au-status-k">
        <StatusDot color={DOT[status]} />
        <span>{copy.label}</span>
      </div>
      <p>{description}</p>
    </div>
  );
}
