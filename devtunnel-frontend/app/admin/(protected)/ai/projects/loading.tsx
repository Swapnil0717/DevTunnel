// src/app/admin/(protected)/ai/projects/loading.tsx
import { SkeletonPageHeader } from "@/components/ui/skeleton";
import {
  SkeletonGroqBudgetPanel,
  SkeletonRunButtonRow,
  SkeletonAiQueueSection,
} from "@/components/admin/ai-discovery/ai-discovery-skeletons";

/**
 * `/admin/ai/projects` — one `getAiDiscoveredProjects("PENDING")` fetch,
 * rendered as `AiDiscoveryRunButton` (its own `GroqQuotaPanel`, scoped
 * to `kind="projects"` — no phase breakdown — plus the run button)
 * followed by `AiDiscoveryQueue`'s search/filter toolbar + card list —
 * never a table.
 */
export default function AdminAiProjectsLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10" aria-hidden="true">
      <SkeletonPageHeader withAction={false} />
      <SkeletonGroqBudgetPanel />
      <SkeletonRunButtonRow />
      <SkeletonAiQueueSection rows={4} />
    </main>
  );
}