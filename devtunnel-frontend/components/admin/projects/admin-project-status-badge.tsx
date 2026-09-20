import { StatusDot } from "@/components/ui/status-dot";
import type { AdminProjectStatus } from "@/lib/admin/projects/types";

const STATUS_COPY: Record<AdminProjectStatus, { label: string; dotColor: string }> = {
  ACTIVE: { label: "Active", dotColor: "#1D9E75" },
  ARCHIVED: { label: "Archived", dotColor: "#6B6B6B" },
};

/**
 * "Status" column (admin_workflow.txt section 4). The dot is decorative —
 * `StatusDot` is always paired with the real word ("Active"/"Archived"),
 * never the only way the status is conveyed
 * (Frontend_Development_Rules.txt rule 43).
 */
export function AdminProjectStatusBadge({ status }: { status: AdminProjectStatus }) {
  const copy = STATUS_COPY[status] ?? { label: status, dotColor: "#6B6B6B" };

  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-secondary">
      <StatusDot color={copy.dotColor} />
      {copy.label}
    </span>
  );
}