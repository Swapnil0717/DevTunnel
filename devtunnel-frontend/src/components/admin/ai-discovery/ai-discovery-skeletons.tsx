import { BlueprintFill } from "@/components/ui/blueprint-kit";

/**
 * Skeleton placeholders for the AI Discovery admin pages
 * (`/admin/ai/{projects,tools,tasks,confirmation}`).
 *
 * These pages don't render a table — `GroqQuotaPanel`, `BudgetShareEditor`,
 * `AiDiscoveryRunButton`, and `AiDiscoveryQueue` (all in this same
 * directory) have their own card/list shapes, so the generic
 * `BlueprintPageHeader` + `BlueprintTable` pair used elsewhere renders a
 * box with completely different dimensions than what actually replaces
 * it. Each skeleton below mirrors its real counterpart's markup
 * (padding, row heights, section order) closely enough that the loading
 * state doesn't visibly resize the page once data arrives.
 */

/** One Requests-or-Tokens metric row inside the Groq budget card: a label/value line + a thin progress bar + a "left this minute" caption. */
function BlueprintBudgetMetricRow() {
  return (
    <div className="mt-2.5" aria-hidden="true">
      <div className="flex items-center justify-between gap-3">
        <BlueprintFill className="h-2.5 w-16" />
        <BlueprintFill className="h-3 w-32" />
      </div>
      <BlueprintFill className="mt-1.5 h-1.5 w-full rounded-full" />
      <BlueprintFill className="mt-1 h-2.5 w-40" />
    </div>
  );
}

/**
 * Matches `GroqQuotaPanel` (groq-quota-panel.tsx): icon+title row, a
 * Requests row, a Tokens row, and a "Resets in…" footer line.
 *
 * Pass `withPhaseBreakdown` on the account-wide Confirmation page (no
 * `kind` prop on the real panel there, so it also renders the
 * "Split by phase" block with one row per discovery phase) — the
 * `kind`-scoped panels on `/admin/ai/{projects,tools,tasks}` never show
 * that block, so leave it off there.
 */
export function BlueprintGroqBudgetPanel({ withPhaseBreakdown = false }: { withPhaseBreakdown?: boolean }) {
  return (
    <div className="mb-6 rounded-[8px] border border-white/15 bg-white/[0.03] p-3.5" aria-hidden="true">
      <div className="flex items-center gap-1.5">
        <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-full" />
        <BlueprintFill className="h-3 w-28" />
      </div>

      <BlueprintBudgetMetricRow />
      <BlueprintBudgetMetricRow />

      {withPhaseBreakdown ? (
        <div className="mt-3.5 border-t border-white/15 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <BlueprintFill className="h-2.5 w-20" />
            <BlueprintFill className="h-2.5 w-28" />
          </div>
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index}>
                <div className="flex items-center justify-between gap-3">
                  <BlueprintFill className="h-2.5 w-20" />
                  <BlueprintFill className="h-2.5 w-36" />
                </div>
                <BlueprintFill className="mt-1 h-1 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between">
        <BlueprintFill className="h-2.5 w-24" />
      </div>
    </div>
  );
}

/**
 * Matches `BudgetShareEditor` (budget-share-editor.tsx) — only rendered
 * on the Confirmation page, alongside the account-wide budget panel:
 * icon+title row, a description line, three label+input rows (Projects/
 * Tools/Tasks), and a footer row (total + two buttons).
 */
export function BlueprintBudgetShareEditor() {
  return (
    <div className="mb-6 rounded-[8px] border border-white/15 bg-white/[0.03] p-3.5" aria-hidden="true">
      <div className="flex items-center gap-1.5">
        <BlueprintFill className="h-3.5 w-3.5 shrink-0 rounded-full" />
        <BlueprintFill className="h-3 w-32" />
      </div>
      <BlueprintFill className="mt-1.5 h-2.5 w-full max-w-[420px]" />

      <div className="mt-3 flex flex-col gap-2.5">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <BlueprintFill className="h-2.5 w-24" />
            <BlueprintFill className="h-6 w-16 rounded-[6px]" />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-2.5">
        <BlueprintFill className="h-2.5 w-20" />
        <div className="flex items-center gap-2">
          <BlueprintFill className="h-7 w-28 rounded-md" />
          <BlueprintFill className="h-7 w-20 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/**
 * Matches the button row `AiDiscoveryRunButton` renders below its own
 * `GroqQuotaPanel` (already covered by `BlueprintGroqBudgetPanel` above) —
 * a primary "Add AI …" button, plus the Tasks page's second "Auto-convert
 * issues…" button when `withSecondary` is set.
 */
export function BlueprintRunButtonRow({ withSecondary = false }: { withSecondary?: boolean }) {
  return (
    <div className="mb-8 flex flex-wrap items-center gap-2" aria-hidden="true">
      <BlueprintFill className="h-9 w-40 rounded-md" />
      {withSecondary ? <BlueprintFill className="h-9 w-64 rounded-md" /> : null}
    </div>
  );
}

/** One `<li>` item card inside `AiDiscoveryQueue`'s list: title link, subtitle line, a row of meta chips, a reasoning line, and two action buttons. */
function BlueprintQueueItem() {
  return (
    <li className="rounded-lg border border-white/25 p-4" aria-hidden="true">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <BlueprintFill className="h-3.5 w-64 max-w-full" />
          <BlueprintFill className="mt-2 h-3 w-full max-w-[420px]" />
          <div className="mt-2 flex flex-wrap gap-2">
            <BlueprintFill className="h-4 w-16" />
            <BlueprintFill className="h-4 w-20" />
            <BlueprintFill className="h-4 w-14" />
          </div>
          <BlueprintFill className="mt-2 h-3 w-full max-w-[360px]" />
        </div>
        <div className="flex shrink-0 gap-2">
          <BlueprintFill className="h-7 w-20 rounded-md" />
          <BlueprintFill className="h-7 w-16 rounded-md" />
        </div>
      </div>
    </li>
  );
}

/**
 * Matches `AiDiscoveryQueue`'s rendered shape: the search/filter toolbar
 * card (search box + a couple of filter selects + "Confirm all" button +
 * a "Showing N of M" caption), then the list of item cards.
 */
export function BlueprintAiQueueSection({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="flex flex-col gap-3 rounded-lg border border-white/15 bg-white/[0.03] p-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <BlueprintFill className="h-8 w-full rounded-[8px] sm:w-64" />
            <BlueprintFill className="h-8 w-28 rounded-[8px]" />
            <BlueprintFill className="h-8 w-28 rounded-[8px]" />
          </div>
          <BlueprintFill className="h-8 w-32 rounded-md" />
        </div>
        <BlueprintFill className="h-2.5 w-40" />
      </div>

      <ul className="flex flex-col gap-3">
        {Array.from({ length: rows }).map((_, index) => (
          <BlueprintQueueItem key={index} />
        ))}
      </ul>
    </div>
  );
}