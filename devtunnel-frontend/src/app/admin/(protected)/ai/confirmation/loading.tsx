import { SkeletonPageHeader, SkeletonBlock } from "@/components/ui/skeleton";
import {
  SkeletonGroqBudgetPanel,
  SkeletonBudgetShareEditor,
  SkeletonAiQueueSection,
} from "@/components/admin/ai-discovery/ai-discovery-skeletons";

/**
 * `/admin/ai/confirmation` — one `getAiConfirmationQueue()` fetch.
 * Renders as: page header, the account-wide `AiBudgetOverview`
 * (`GroqQuotaPanel` with its per-phase breakdown + `BudgetShareEditor`),
 * then three separate `AiDiscoveryQueue` sections (Projects/Tools/Tasks),
 * each with its own heading — never a single table.
 */
export default function AdminAiConfirmationLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader actions={0} />
      <SkeletonGroqBudgetPanel withPhaseBreakdown />
      <SkeletonBudgetShareEditor />

      <div className="flex flex-col gap-8">
        {Array.from({ length: 3 }).map((_, index) => (
          <section key={index}>
            <SkeletonBlock className="mb-3 h-3 w-32" />
            <SkeletonAiQueueSection rows={2} />
          </section>
        ))}
      </div>
    </div>
  );
}