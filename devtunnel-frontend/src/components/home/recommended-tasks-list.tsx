import { TaskRow } from "./task-row";
import { getRecommendedTasks } from "@/lib/home/api";

export async function RecommendedTasksList() {
  const result = await getRecommendedTasks();

  if (result.status === "error") {
    return (
      <p className="text-[11.5px] text-status-error-text">
        Couldn&apos;t load recommended tasks. Try refreshing the page.
      </p>
    );
  }

  if (result.status === "empty") {
    return (
      <p className="text-[11.5px] text-text-dim">No recommended tasks right now.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
      {result.data.map((task) => (
        <li key={task.taskId}>
          <TaskRow
            variant="recommended"
            taskId={task.taskId}
            title={task.title}
            projectSlug={task.projectSlug}
            role={task.role}
          />
        </li>
      ))}
    </ul>
  );
}