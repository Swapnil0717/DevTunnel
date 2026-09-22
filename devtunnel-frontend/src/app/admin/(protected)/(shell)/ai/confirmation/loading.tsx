// src/app/admin/(protected)/(shell)/ai/confirmation/loading.tsx
import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintPageHeader } from "@/components/ui/blueprint-kit";
import {
  BlueprintGroqBudgetPanel,
  BlueprintBudgetShareEditor,
  BlueprintAiQueueSection,
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
    <BlueprintSheet
      sheetLabel="Sheet A5.4 — AI confirmation"
      revLabel="Rev — loading budget"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader withAction={false} />
      <BlueprintGroqBudgetPanel withPhaseBreakdown />
      <BlueprintBudgetShareEditor />
      <div className="flex flex-col gap-8">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index}>
            <BlueprintFill className="mb-3 h-3.5 w-32" />
            <BlueprintAiQueueSection rows={2} />
          </div>
        ))}
      </div>
    </BlueprintSheet>
  );
}