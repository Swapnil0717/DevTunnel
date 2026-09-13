// devtunnel-frontend/src/components/admin/ai-discovery/ai-budget-overview.tsx
"use client";

import { useState } from "react";
import { GroqQuotaPanel } from "@/components/admin/ai-discovery/groq-quota-panel";
import { BudgetShareEditor } from "@/components/admin/ai-discovery/budget-share-editor";

/**
 * Account-wide Groq budget view for the Confirmation page: the read-only
 * usage panel (`GroqQuotaPanel`, no `kind` — shows the per-phase
 * breakdown) plus the editor that lets an admin change the projects/
 * tools/tasks split those percentages reflect. Kept together in one
 * client component so saving a new split can bump a shared
 * `quotaRefreshKey` and have the panel re-fetch immediately, instead of
 * the two drifting out of sync until the next 30s poll.
 */
export function AiBudgetOverview() {
  const [quotaRefreshKey, setQuotaRefreshKey] = useState(0);

  return (
    <>
      <GroqQuotaPanel refreshKey={quotaRefreshKey} />
      <BudgetShareEditor onSaved={() => setQuotaRefreshKey((k) => k + 1)} />
    </>
  );
}
