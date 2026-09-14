import { SkeletonPageHeader } from "@/components/ui/skeleton";
import { SkeletonGroqBudgetPanel, SkeletonRunButtonRow, SkeletonAiQueueSection } from "@/components/admin/ai-discovery/ai-discovery-skeletons";

/**
 * `/admin/ai/tools` — one `getAiDiscoveredTools("PENDING")` fetch, same
 * shape as `/admin/ai/projects`'s loading state (kind-scoped budget
 * panel + run button + filterable queue list, not a table).
 */
export default function AdminAiToolsLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader actions={0} />
      <SkeletonGroqBudgetPanel />
      <SkeletonRunButtonRow />
      <SkeletonAiQueueSection rows={3} />
    </div>
  );
}