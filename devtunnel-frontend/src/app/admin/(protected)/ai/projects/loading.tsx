import { SkeletonPageHeader } from "@/components/ui/skeleton";
import { SkeletonGroqBudgetPanel, SkeletonRunButtonRow, SkeletonAiQueueSection } from "@/components/admin/ai-discovery/ai-discovery-skeletons";

/**
 * `/admin/ai/projects` — one `getAiDiscoveredProjects("PENDING")` fetch.
 * Renders as: page header (no action button), `AiDiscoveryRunButton`'s
 * own kind-scoped `GroqQuotaPanel` + run button, then `AiDiscoveryQueue`
 * as a filterable list of item cards — never a table.
 */
export default function AdminAiProjectsLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader actions={0} />
      <SkeletonGroqBudgetPanel />
      <SkeletonRunButtonRow />
      <SkeletonAiQueueSection rows={3} />
    </div>
  );
}