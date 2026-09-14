// src/app/admin/(protected)/ai/tasks/loading.tsx
import { SkeletonPageHeader } from "@/components/ui/skeleton";
import {
  SkeletonGroqBudgetPanel,
  SkeletonRunButtonRow,
  SkeletonAiQueueSection,
} from "@/components/admin/ai-discovery/ai-discovery-skeletons";

/**
 * `/admin/ai/tasks` — one `getAiDiscoveredTasks("PENDING")` fetch,
 * rendered as `AiDiscoveryRunButton` (its own `GroqQuotaPanel`, scoped
 * to `kind="tasks"`, plus the run button AND the Tasks-only second
 * "Auto-convert issues until budget runs out" button) followed by
 * `AiDiscoveryQueue`'s toolbar + card list — never a table.
 */
export default function AdminAiTasksLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10" aria-hidden="true">
      <SkeletonPageHeader withAction={false} />
      <SkeletonGroqBudgetPanel />
      <SkeletonRunButtonRow withSecondary />
      <SkeletonAiQueueSection rows={4} />
    </main>
  );
}