import { TaskRow } from "./task-row";
import { SectionMessage } from "./section-message";
import { getMyTasks } from "@/lib/home/api";

/**
 * "Your tasks" on Home — every task the signed-in contributor has claimed
 * with `dev start`, each with its stage, from `GET /users/me/tasks`.
 *
 * Above the list is a one-line tally by stage ("1 in progress · 1 PR
 * submitted · 2 done"), so the section works as a progress summary and not
 * just a list. Only stages that have at least one task appear — no
 * "0 open" filler — and it's built from the same rows rendered below, so
 * it can't disagree with them (rule 38).
 *
 * The backend returns tasks still being worked on ahead of finished ones,
 * so the list leads with what needs attention.
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
      <SectionMessage>
        Your tasks aren&apos;t available yet — check back soon.
      </SectionMessage>
    );
  }

  if (result.status === "empty") {
    return (
      <SectionMessage>
        You haven&apos;t started any tasks yet. Browse recommended projects
        to get started.
      </SectionMessage>
    );
  }

  const tally = TALLY.map(({ status, label }) => ({
    label,
    count: result.data.filter((task) => task.status === status).length,
  })).filter((entry) => entry.count > 0);

  return (
    <div>
      {tally.length > 0 ? (
        <p className="m-0 mb-2 text-[11px] text-text-faint">
          {tally.map((entry) => `${entry.count} ${entry.label}`).join(" · ")}
        </p>
      ) : null}
      <ul className="flex flex-col gap-1.5 list-none p-0 m-0">
        {result.data.map((task) => (
          <li key={task.taskId}>
            <TaskRow
              variant="mine"
              taskId={task.taskId}
              title={task.title}
              projectSlug={task.projectSlug}
              status={task.status}
              projectName={task.projectName}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
