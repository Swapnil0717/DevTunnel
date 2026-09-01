import Link from "next/link";

const STATUS_STYLES: Record<
  "TODO" | "IN_PROGRESS" | "IN_REVIEW",
  { label: string; className: string }
> = {
  TODO: { label: "To do", className: "bg-status-idle-bg text-status-idle-text" },
  IN_PROGRESS: {
    label: "In progress",
    className: "bg-status-info-bg text-status-info-text",
  },
  IN_REVIEW: {
    label: "In review",
    className: "bg-status-success-bg text-status-success-text",
  },
};

type TaskRowProps =
  | {
      variant: "recommended";
      taskId: string;
      title: string;
      projectSlug: string;
      role: string;
    }
  | {
      variant: "mine";
      taskId: string;
      title: string;
      projectSlug: string;
      status: keyof typeof STATUS_STYLES;
    };

export function TaskRow(props: TaskRowProps) {
  const href = `/projects/${props.projectSlug}/tasks/${props.taskId}`;

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2.5 hover:bg-surface-raised"
    >
      <span className="text-[11.5px] text-text truncate">{props.title}</span>
      {props.variant === "recommended" ? (
        <span className="shrink-0 text-[10px] text-status-success-text">
          Match · {props.role}
        </span>
      ) : (
        <span
          className={`shrink-0 text-[10px] px-[7px] py-[2px] rounded-[5px] ${STATUS_STYLES[props.status].className}`}
        >
          {STATUS_STYLES[props.status].label}
        </span>
      )}
    </Link>
  );
}
