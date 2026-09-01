import { TaskRow } from "./task-row";
import { getMyTasks } from "@/lib/home/api";

export async function MyTasksList() {
  const result = await getMyTasks();

  if (result.status === "error") {
    return (
      <p className="text-[11.5px] text-status-error-text">
        Couldn&apos;t load your tasks. Try refreshing the page.
      </p>
    );
  }

  if (result.status === "empty") {
    return (
      <p className="text-[11.5px] text-text-dim">
        You don&apos;t have any active tasks yet. Browse recommended projects to
        get started.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
      {result.data.map((task) => (
        <li key={task.taskId}>
          <TaskRow
            variant="mine"
            taskId={task.taskId}
            title={task.title}
            projectSlug={task.projectSlug}
            status={task.status}
          />
        </li>
      ))}
    </ul>
  );
}