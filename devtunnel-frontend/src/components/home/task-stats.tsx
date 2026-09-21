import { getMyTasks } from "@/lib/home/api";
import { summarizeTasks } from "@/lib/home/task-summary";
import { HOME_PANEL } from "./styles";

const STAT_LABELS: { key: keyof ReturnType<typeof summarizeTasks>; label: string }[] = [
  { key: "inProgress", label: "In progress" },
  { key: "inReview", label: "PRs submitted" },
  { key: "done", label: "Tasks completed" },
];

/**
 * The three-count strip under the journey card, drawn as one bordered panel
 * split by hairlines (as in the redesign) rather than three separate tiles.
 * Same `getMyTasks()` call `MyTasksList` and `JourneyCard` already make —
 * Next's automatic fetch request memoization (same URL + options, one render
 * pass) means this doesn't cost a second network round trip, so there was no
 * need to lift the fetch into the page and thread it down as a prop just to
 * avoid duplication.
 *
 * Semantically a description list — each label is a term, each number its
 * value — under a visually hidden `<h2>` so the page outline has a heading
 * for it. (The old `aria-label` on a plain `<div>` gave assistive tech
 * nothing to announce.)
 *
 * Deliberately just three raw counts, not a fourth "success rate" or similar
 * derived metric — see `lib/home/task-summary.ts`'s doc comment on why this
 * reads only from `MyTask[]` rather than a real stats endpoint; a computed
 * ratio on top of a placeholder tally would compound that into a number that
 * looks more authoritative than it is.
 */
export async function TaskStats() {
  const result = await getMyTasks();
  const counts = summarizeTasks(result.status === "ok" ? result.data : []);

  return (
    <section aria-labelledby="task-stats-heading" className="mb-9">
      <h2 id="task-stats-heading" className="sr-only">
        Your task counts
      </h2>
      <dl className={`m-0 grid grid-cols-3 ${HOME_PANEL}`}>
        {STAT_LABELS.map(({ key, label }, index) => (
          <div
            key={key}
            className={`px-3 py-3.5 sm:px-5 sm:py-4 ${index > 0 ? "border-l border-[#1F1F1F]" : ""}`}
          >
            <dt className="text-[12.5px] text-text-muted">{label}</dt>
            <dd className="m-0 mt-1 text-[28px] font-medium leading-[1.2] tracking-[-0.02em] text-text">
              {counts[key]}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
