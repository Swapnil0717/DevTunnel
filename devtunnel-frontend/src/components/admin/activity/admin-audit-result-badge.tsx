import { StatusDot } from "@/components/ui/status-dot";
import type { AdminAuditResult } from "@/lib/admin/activity/types";

/**
 * "Result" column for the Activity table. Same convention as
 * `AdminTaskStatusBadge` / `AdminProjectStatusBadge`: the dot is
 * decorative, always paired with the real word, never the only way the
 * result is conveyed (Frontend_Development_Rules.txt rule 43). Colors
 * reuse the app's existing `status.success` / `status.error` /
 * `status.idle` tokens rather than inventing a new palette — green for
 * a successful action, orange for a denied one, red for a failed one.
 */
const RESULT_COPY: Record<AdminAuditResult, { label: string; dotColor: string }> = {
  SUCCESS: { label: "Success", dotColor: "#1D9E75" },
  DENIED: { label: "Denied", dotColor: "#D2691E" },
  FAILURE: { label: "Failure", dotColor: "#DC4C4C" },
};

export function AdminAuditResultBadge({ result }: { result: AdminAuditResult }) {
  const copy = RESULT_COPY[result] ?? { label: result, dotColor: "#6B6B6B" };

  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-secondary">
      <StatusDot color={copy.dotColor} />
      {copy.label}
    </span>
  );
}