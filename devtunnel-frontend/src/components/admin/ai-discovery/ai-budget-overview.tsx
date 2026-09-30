// devtunnel-frontend/src/components/admin/ai-discovery/ai-budget-overview.tsx
"use client";

import { useState } from "react";
import { GroqQuotaPanel } from "@/components/admin/ai-discovery/groq-quota-panel";
import { ProviderUsageTable } from "@/components/admin/ai-discovery/provider-usage-table";
import { BudgetShareEditor } from "@/components/admin/ai-discovery/budget-share-editor";

/**
 * Account-wide AI view for the Confirmation page, top to bottom:
 *  1. `ProviderUsageTable` (Part 7) — every AI provider's usage today,
 *     status (available / exhausted until…) and last error;
 *  2. `GroqQuotaPanel` (no `kind` — shows the per-phase breakdown) — the
 *     discovery model's projects/tools/tasks budget;
 *  3. `BudgetShareEditor` — changes the split those percentages reflect.
 * One client component so saving a new split bumps a shared
 * `quotaRefreshKey` and both read-only panels re-fetch immediately instead of
 * waiting for their next poll.
 */
export function AiBudgetOverview() {
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0);

  return (
    <>
      <ProviderUsageTable refreshKey={quotaRefreshKey} />
      <GroqQuotaPanel refreshKey={quotaRefreshKey} />
      <BudgetShareEditor onSaved={() => setQuotaRefreshKey((k) => k + 1)} />
    </>
  );
}
