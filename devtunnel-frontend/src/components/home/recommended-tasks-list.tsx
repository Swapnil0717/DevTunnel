import { TaskRow } from "./task-row";
import { SectionMessage } from "./section-message";
import { getRecommendedTasks } from "@/lib/home/api";

export async function RecommendedTasksList() {
  const result = await getRecommendedTasks();

  if (result.status === "error") {
    return (
      <SectionMessage>
        Recommended tasks aren&apos;t available yet — check back soon.
      </SectionMessage>
    );
  }

  if (result.status === "empty") {
    return <SectionMessage>No recommended tasks right now.</SectionMessage>;
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