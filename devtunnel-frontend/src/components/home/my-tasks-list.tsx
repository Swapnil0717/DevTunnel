import { TaskRow } from "./task-row";
import { HomeMessage } from "./home-message";
import { HOME_LIST } from "./styles";
import { getMyTasks } from "@/lib/home/api";

/**
 * How many of the contributor's tasks Home lists. `GET /users/me/tasks`
 * returns every task they've ever claimed; Home is a preview with a "See all"
 * link, so it shows the first few — and the backend already orders tasks
 * still being worked on ahead of finished ones, so those are the ones that
 * make the cut.
 */
const HOME_MY_TASKS_LIMIT = 5;

/**
 * "Your tasks" on Home — tasks the signed-in contributor has claimed with
 * `dev start`, each with its stage, from `GET /users/me/tasks`.
 *
 * Above the list is a one-line tally by stage ("1 in progress · 1 PR
 * submitted · 2 done"), so the section works as a progress summary and not
 * just a list. Only stages that have at least one task appear — no
 * "0 open" filler — and it counts *all* of the contributor's tasks, not just
 * the rows shown (rule 38).
 */
const TALLY: { status: "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "OPEN"; label: string }[] = [
  { status: "OPEN", label: "open" },
  { status: "IN_PROGRESS", label: "in progress" },
  { status: "IN_REVIEW", label: "PR submitted" },
  { status: "DONE", label: "done" },
];

export async function MyTasksList() {
  const result = await getMyTasks();

  if (result.status === "error") {
    return (
      <HomeMessage>
        Your tasks aren&apos;t available yet — check back soon.
      </HomeMessage>
    );
  }

  if (result.status === "empty") {
    return (
      <HomeMessage>
        You haven&apos;t started any tasks yet. Browse recommended projects
        to get started.
      </HomeMessage>
    );
  }

  const tally = TALLY.map(({ status, label }) => ({
    label,
    count: result.data.filter((task) => task.status === status).length,
  })).filter((entry) => entry.count > 0);

  return (
    <div>
      {tally.length > 0 ? (
        <p className="m-0 mb-2 text-[12px] text-text-dim">
          {tally.map((entry) => `${entry.count} ${entry.label}`).join(" · ")}
        </p>
      ) : null}
      <ul className={`${HOME_LIST} m-0 list-none p-0`}>
        {result.data.slice(0, HOME_MY_TASKS_LIMIT).map((task) => (
          <li key={task.taskId}>
            <TaskRow
              variant="mine"
              taskId={task.taskId}
              title={task.title}
              projectSlug={task.projectSlug}
              status={task.status}
              projectName={task.projectName}
              startedAt={task.startedAt}
              pullRequest={task.pullRequest}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
