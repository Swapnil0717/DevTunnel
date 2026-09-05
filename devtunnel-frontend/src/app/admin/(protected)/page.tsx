import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminTractionChart } from "@/components/admin/admin-traction-chart";

export const metadata: Metadata = buildMetadata({
  title: "Admin dashboard",
  description: "DevTunnel Admin Portal — curate and publish open source projects.",
  path: "/admin",
  // Private application UI, never public content (rule 18).
  noIndex: true,
});

/**
 * `/admin` — Admin Portal Master Coding Specification, section 3 (Admin
 * Dashboard).
 *
 * The spec calls for exactly two things here: a metric grid, and a
 * time-series graph of user activity — nothing repository-health related
 * ("It should not become a repository-health dashboard").
 *
 * Metrics, per section 3:
 *  - Primary: Total Users, Total Projects, Total Tasks, Tasks Submitted.
 *  - Optional secondary: Active Contributors, Completed Tasks, Open
 *    DevTunnel Tasks.
 *
 * "Only include metrics that already exist or can be reliably calculated
 * from the database" — there is no `GET /admin/dashboard` aggregation
 * endpoint on the backend yet (only `/admin/auth` and `/admin/activity`
 * exist today), so every value below renders as an honest "—" via
 * `AdminStatCard` rather than a fabricated number (rule 58 — AI-generated
 * code must not invent statistics). Wiring up the real numbers later only
 * means replacing the `null`s with a fetch call once that endpoint ships —
 * this shell doesn't need to change shape.
 *
 * The User Activity / Traction Graph (section 3) has the same "no invented
 * data" treatment in `AdminTractionChart`, backed by the not-yet-built
 * `GET /admin/dashboard/activity`.
 *
 * Everything else in the spec's page list (Projects, Project Onboarding,
 * Tasks, Task Onboarding, New Issues, Activity) is intentionally not built
 * as a page yet — it's listed in `AdminSidebar` / `AdminMobileNav` as
 * disabled "Soon" entries instead, so the full shape of the portal is
 * visible without shipping links to pages that don't exist (rule 11).
 */
export default async function AdminDashboardPage() {
  const user = await getServerUser();

  const primaryStats: { label: string; value: number | null }[] = [
    { label: "Total users", value: null },
    { label: "Total projects", value: null },
    { label: "Total tasks", value: null },
    { label: "Tasks submitted", value: null },
  ];

  const secondaryStats: { label: string; value: number | null }[] = [
    { label: "Active contributors", value: null },
    { label: "Completed tasks", value: null },
    { label: "Open DevTunnel tasks", value: null },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="m-0 mb-1 text-xl font-medium text-text">Admin dashboard</h1>
      <p className="m-0 mb-8 text-sm text-text-muted">
        Signed in as <strong className="text-text">{user?.username}</strong>
        {user?.name ? ` (${user.name})` : null} — admin access confirmed.
      </p>

      <section aria-labelledby="dashboard-stats-heading" className="mb-8">
        <h2
          id="dashboard-stats-heading"
          className="mb-2.5 text-[12.5px] font-normal text-text-muted"
        >
          Platform overview
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {primaryStats.map((stat) => (
            <AdminStatCard key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      </section>

      <section aria-labelledby="dashboard-secondary-stats-heading" className="mb-8">
        <h2
          id="dashboard-secondary-stats-heading"
          className="mb-2.5 text-[12.5px] font-normal text-text-muted"
        >
          Contribution &amp; task activity
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {secondaryStats.map((stat) => (
            <AdminStatCard key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      </section>

      <section aria-labelledby="dashboard-activity-heading" className="mb-8">
        <h2
          id="dashboard-activity-heading"
          className="mb-2.5 text-[12.5px] font-normal text-text-muted"
        >
          User activity
        </h2>
        <AdminTractionChart />
      </section>

      <div className="rounded-[10px] border border-border bg-surface px-6 py-5">
        <p className="m-0 mb-2 text-sm font-medium text-text">
          Project and task curation tools aren&apos;t live yet
        </p>
        <p className="m-0 text-[13px] leading-[1.6] text-text-muted">
          Project onboarding, task onboarding, and the dashboard aggregation
          endpoints are listed in the sidebar so the full shape of the
          portal is visible, but they open once the corresponding{" "}
          <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-xs text-text-secondary">
            /admin/*
          </code>{" "}
          backend routes exist. Admin authentication and access control are
          fully wired up.
        </p>
      </div>
    </main>
  );
}