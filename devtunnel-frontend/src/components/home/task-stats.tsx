import { getMyTasks } from "@/lib/home/api";
import { summarizeTasks } from "@/lib/home/task-summary";

const STAT_LABELS: { key: keyof ReturnType<typeof summarizeTasks>; label: string }[] = [
  { key: "inProgress", label: "In progress" },
  { key: "inReview", label: "PRs submitted" },
  { key: "done", label: "Tasks completed" },
];

/**
 * Three stat cards under the journey card. Same `getMyTasks()` call
 * `MyTasksList` and `JourneyCard` already make — Next's automatic fetch
 * request memoization (same URL + options, one render pass) means this
 * doesn't cost a second network round trip, so there was no need to lift
 * the fetch into the page and thread it down as a prop just to avoid
 * duplication.
 *
 * Deliberately just three raw counts, not a fourth "success rate" or
 * similar derived metric — see `lib/home/task-summary.ts`'s doc comment
 * on why this reads only from `MyTask[]` rather than a real stats
 * endpoint; a computed ratio on top of a placeholder tally would compound
 * that into a number that looks more authoritative than it is.
 */
export async function TaskStats() {
  const result = await getMyTasks();
  const counts = summarizeTasks(result.status === "ok" ? result.data : []);

  return (
    <div className="mb-5 grid grid-cols-3 gap-3" aria-label="Your task counts">
      {STAT_LABELS.map(({ key, label }) => (
        <div key={key} className="rounded-lg bg-surface-raised px-4 py-3.5">
          <p className="m-0 mb-1 text-[12.5px] text-text-secondary">{label}</p>
          <p className="m-0 text-2xl font-medium text-text">{counts[key]}</p>
        </div>
      ))}
    </div>
  );
}
