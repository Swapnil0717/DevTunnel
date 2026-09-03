import { TaskRow } from "./task-row";
import { SectionMessage } from "./section-message";
import { getMyTasks } from "@/lib/home/api";

export async function MyTasksList() {
  const result = await getMyTasks();

  if (result.status === "error") {
    return (
      <SectionMessage>
        Your tasks aren&apos;t available yet — check back soon.
      </SectionMessage>
    );
  }

  if (result.status === "empty") {
    return (
      <SectionMessage>
        You don&apos;t have any active tasks yet. Browse recommended projects
        to get started.
      </SectionMessage>
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