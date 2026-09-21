// src/app/admin/(protected)/loading.tsx
import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintStatCards, BlueprintTable } from "@/components/ui/blueprint-kit";

/**
 * `/admin` dashboard loading boundary. The page fires 6 requests in
 * parallel (`getServerUser`, `getAdminAuthMe`, `getAdminProjects`,
 * `getAdminTasks`, `getAiDiscoveryStatus`, `getRecentAdminActivity`) —
 * each is a fast indexed query on its own, but rendered together this
 * gives the first paint something to show instead of a blank panel
 * while all six resolve.
 *
 * Matches the real page's six sections in order: title + "signed in as"
 * line, a 4-card "Platform overview" row, a 3-card "Contribution & task
 * activity" row, the traction chart, a 4-card "AI discovery today" row,
 * the 6-column recent-activity table, then the "Quick actions" panel.
 */
export default function AdminDashboardLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A0 — Admin"
      revLabel="Rev — loading dashboard"
      contentClassName="w-full mx-auto max-w-5xl px-6 py-10"
    >
      <BlueprintFill className="mb-1 h-6 w-48" />
      <BlueprintFill className="mb-8 h-3 w-80" />

      <div className="mb-8">
        <BlueprintFill className="mb-2.5 h-2.5 w-32" />
        <BlueprintStatCards count={4} />
      </div>

      <div className="mb-8">
        <BlueprintFill className="mb-2.5 h-2.5 w-40" />
        <BlueprintStatCards count={3} />
      </div>

      <div className="mb-8">
        <BlueprintFill className="mb-2.5 h-2.5 w-28" />
        <BlueprintFill className="h-[140px] w-full" />
      </div>

      <div className="mb-8">
        <BlueprintFill className="mb-2.5 h-2.5 w-36" />
        <BlueprintStatCards count={4} />
      </div>

      <div className="mb-8">
        <BlueprintFill className="mb-2.5 h-2.5 w-32" />
        <BlueprintTable
          rows={5}
          headings={["Time", "Action", "Resource", "Admin", "Result", "Details"]}
          twoLineColumns={0}
        />
      </div>

      <BlueprintFill className="h-[132px] w-full" />
    </BlueprintSheet>
  );
}