// src/app/admin/(protected)/(shell)/ai/tools/loading.tsx
import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintPageHeader } from "@/components/ui/blueprint-kit";
import {
  BlueprintGroqBudgetPanel,
  BlueprintRunButtonRow,
  BlueprintAiQueueSection,
} from "@/components/admin/ai-discovery/ai-discovery-skeletons";

/**
 * `/admin/ai/tools` — one `getAiDiscoveredTools("PENDING")` fetch,
 * rendered as `AiDiscoveryRunButton` (its own `GroqQuotaPanel`, scoped
 * to `kind="tools"` — no phase breakdown — plus the run button)
 * followed by `AiDiscoveryQueue`'s search/filter toolbar + card list —
 * never a table.
 */
export default function AdminAiToolsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A5.2 — AI tools"
      revLabel="Rev — loading queue"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader withAction={false} />
      <BlueprintGroqBudgetPanel />
      <BlueprintRunButtonRow />
      <BlueprintAiQueueSection rows={4} />
    </BlueprintSheet>
  );
}