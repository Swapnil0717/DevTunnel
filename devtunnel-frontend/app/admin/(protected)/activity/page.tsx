import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getAdminActivityLog } from "@/lib/admin/activity/api";
import { AdminActivityExplorer } from "@/components/admin/activity/admin-activity-explorer";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "Activity",
  description: "Audit log of admin actions and access checks on DevTunnel.",
  path: "/admin/activity",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/admin/activity` — devtunnel_workflow.txt section 43 / A16 in the
 * final page list.
 *
 * Read-only, searchable view over `GET /admin/activity`
 * (devtunnel-backend `src/routes/admin/activity.ts`) — every denied
 * admin/permission check and every state-changing admin action's own
 * audit write, newest first. `getAdminActivityLog` walks the backend's
 * keyset pagination in full so `AdminActivityExplorer` can filter the
 * complete log client-side and page through it 20-at-a-time, matching
 * every other Admin Explorer page.
 */
export default async function AdminActivityPage() {
  const result = await getAdminActivityLog();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">Activity</h1>
        <p className="m-0 text-sm text-text-muted">
          Audit log of admin actions and access checks — newest first.
        </p>
      </div>

      {result.status === "error" ? (
        <SectionMessage>Activity isn&apos;t available yet — check back soon.</SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>No admin activity has been recorded yet.</SectionMessage>
      ) : (
        <AdminActivityExplorer entries={result.data} />
      )}
    </main>
  );
}