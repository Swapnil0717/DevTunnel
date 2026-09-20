// src/app/admin/(protected)/ai/confirmation/loading.tsx
import { SkeletonBlock, SkeletonPageHeader } from "@/components/ui/skeleton";
import {
  SkeletonGroqBudgetPanel,
  SkeletonBudgetShareEditor,
  SkeletonAiQueueSection,
} from "@/components/admin/ai-discovery/ai-discovery-skeletons";

/**
 * `/admin/ai/confirmation` — one `getAiConfirmationQueue()` fetch,
 * rendered as `AiBudgetOverview` (the account-wide `GroqQuotaPanel` —
 * no `kind`, so it shows the "Split by phase" breakdown — plus
 * `BudgetShareEditor`) followed by three separately-headed
 * `AiDiscoveryQueue` toolbar + card lists (Projects, Tools, Tasks) —
 * never a table.
 */
export default function AdminAiConfirmationLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10" aria-hidden="true">
      <SkeletonPageHeader withAction={false} />
      <SkeletonGroqBudgetPanel withPhaseBreakdown />
      <SkeletonBudgetShareEditor />
      <div className="flex flex-col gap-8">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index}>
            <SkeletonBlock className="mb-3 h-3.5 w-32" />
            <SkeletonAiQueueSection rows={2} />
          </div>
        ))}
      </div>
    </main>
  );
}