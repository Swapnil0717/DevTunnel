import { TaskRow } from "./task-row";
import { HomeMessage } from "./home-message";
import { HOME_LIST } from "./styles";
import { getRecommendedTasks } from "@/lib/home/api";

/**
 * "Recommended tasks" on Home — open, unclaimed tasks that fit the
 * contributor's onboarding profile, best fit first, from
 * `GET /users/me/recommended-tasks` (the backend already caps it at a short
 * list). Each row says why it was picked ("Match · Backend Developer"), so
 * the list can be trusted and not just read as a random selection.
 */
export async function RecommendedTasksList() {
  const result = await getRecommendedTasks();

  if (result.status === "error") {
    return (
      <HomeMessage>
        Recommended tasks aren&apos;t available yet — check back soon.
      </HomeMessage>
    );
  }

  if (result.status === "empty") {
    return (
      <HomeMessage>
        No open tasks match your profile right now — check back soon.
      </HomeMessage>
    );
  }

  return (
    <ul className={`${HOME_LIST} m-0 list-none p-0`}>
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
