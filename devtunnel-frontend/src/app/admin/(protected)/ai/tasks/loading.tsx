import { SkeletonPageHeader } from "@/components/ui/skeleton";
import { SkeletonGroqBudgetPanel, SkeletonRunButtonRow, SkeletonAiQueueSection } from "@/components/admin/ai-discovery/ai-discovery-skeletons";

/**
 * `/admin/ai/tasks` — one `getAiDiscoveredTasks("PENDING")` fetch, same
 * shape as `/admin/ai/projects` but with the second "Auto-convert
 * issues…" loop button `AiDiscoveryRunButton` only renders for
 * `kind="tasks"`.
 */
export default function AdminAiTasksLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader actions={0} />
      <SkeletonGroqBudgetPanel />
      <SkeletonRunButtonRow withSecondary />
      <SkeletonAiQueueSection rows={3} />
    </div>
  );
}