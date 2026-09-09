import { StatusDot } from "@/components/ui/status-dot";
import type { AdminTaskStatus } from "@/lib/admin/tasks/types";

/**
 * "Status" column (admin_workflow.txt section 13). Same convention as
 * `AdminProjectStatusBadge`: the dot is decorative, always paired with
 * the real word, never the only way the status is conveyed
 * (Frontend_Development_Rules.txt rule 43). Colors reuse the app's
 * existing `status.info` / `status.idle` / `status.success` tokens
 * (tailwind.config.ts) in the order a task naturally moves through them
 * — open, in progress, done — rather than inventing a new palette.
 */
const STATUS_COPY: Record<
  AdminTaskStatus,
  { label: string; dotColor: string }
> = {
  OPEN: {
    label: "Open",
    dotColor: "#378ADD",
  },
  IN_PROGRESS: {
    label: "In progress",
    dotColor: "#639922",
  },
  DONE: {
    label: "Done",
    dotColor: "#1D9E75",
  },
};

export function AdminTaskStatusBadge({
  status,
}: {
  status: AdminTaskStatus;
}) {
  const copy =
    STATUS_COPY[status] ?? {
      label: status,
      dotColor: "#6B6B6B",
    };

  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-secondary">
      <StatusDot color={copy.dotColor} />
      {copy.label}
    </span>
  );
}