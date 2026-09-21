import { TaskRow } from "./task-row";
import { SectionMessage } from "./section-message";
import { getRecommendedTasks } from "@/lib/home/api";

/**
 * "Recommended tasks" on Home — open, unclaimed tasks that fit the
 * contributor's onboarding profile, best fit first, from
 * `GET /users/me/recommended-tasks`. Each row says why it was picked
 * ("Match · Backend Developer"), so the list can be trusted and not just
 * read as a random selection.
 */
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
    return (
      <SectionMessage>
        No open tasks match your profile right now — check back soon.
      </SectionMessage>
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
            projectName={task.projectName}
            match={task.match}
          />
        </li>
      ))}
    </ul>
  );
}