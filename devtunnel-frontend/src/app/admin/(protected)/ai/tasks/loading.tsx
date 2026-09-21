// src/app/admin/(protected)/ai/tasks/loading.tsx
import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintPageHeader } from "@/components/ui/blueprint-kit";
import {
  BlueprintGroqBudgetPanel,
  BlueprintRunButtonRow,
  BlueprintAiQueueSection,
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
    <BlueprintSheet
      sheetLabel="Sheet A5.3 — AI tasks"
      revLabel="Rev — loading queue"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader withAction={false} />
      <BlueprintGroqBudgetPanel />
      <BlueprintRunButtonRow withSecondary />
      <BlueprintAiQueueSection rows={4} />
    </BlueprintSheet>
  );
}