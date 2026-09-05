import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "Admin dashboard",
  description: "DevTunnel Admin Portal — curate and publish open source projects.",
  path: "/admin",
  // Private application UI, never public content (rule 18).
  noIndex: true,
});

/**
 * `/admin` (devtunnel_workflow.txt, Module A2 — Admin Dashboard).
 *
 * This builds Module A2's real layout — the metric grid and a recent
 * activity panel, matching the module's own mock-up shape (Projects,
 * Published, Drafts, Tasks, Contributors, Active Projects) — but every
 * value renders as an honest "—" rather than a number. There is no
 * `/admin/*` aggregation endpoint on the backend yet (Module 43 — Admin
 * Backend), and rendering placeholder numbers here would be exactly the
 * fabricated statistics rule 58 forbids ("AI-generated code must not
 * invent SEO data ... statistics"). `AdminStatCard` and `SectionMessage`
 * already know how to render that "not available yet" state, so wiring
 * up the real numbers later only means replacing the `null`s below with
 * a fetch call — the shell doesn't need to change.
 *
 * The rest of Module 31's sections (A3 Projects through A12 Activity)
 * are intentionally not built as pages yet — they're listed in
 * `AdminSidebar` / `AdminMobileNav` as disabled "Soon" entries instead,
 * so the full shape of the portal is visible without shipping links to
 * pages that don't exist (rule 11).
 */
export default async function AdminDashboardPage() {
  const user = await getServerUser();

  const stats: { label: string; value: number | null }[] = [
    { label: "Projects", value: null },
    { label: "Published", value: null },
    { label: "Drafts", value: null },
    { label: "Tasks", value: null },
    { label: "Contributors", value: null },
    { label: "Active projects", value: null },
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <AdminStatCard key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
      </section>

      <section aria-labelledby="dashboard-activity-heading" className="mb-8">
        <h2
          id="dashboard-activity-heading"
          className="mb-2.5 text-[12.5px] font-normal text-text-muted"
        >
          Recent activity
        </h2>
        <SectionMessage>
          Activity will show up here once the Activity API (Module A12) is
          wired up.
        </SectionMessage>
      </section>

      <div className="rounded-[10px] border border-border bg-surface px-6 py-5">
        <p className="m-0 mb-2 text-sm font-medium text-text">
          Project curation tools aren&apos;t live yet
        </p>
        <p className="m-0 text-[13px] leading-[1.6] text-text-muted">
          Repository import, task management, and publishing (Modules
          A3&ndash;A12) are listed in the sidebar so the full shape of the
          portal is visible, but they open once the corresponding{" "}
          <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-xs text-text-secondary">
            /admin/*
          </code>{" "}
          backend endpoints exist. Admin authentication and access control
          are fully wired up.
        </p>
      </div>
    </main>
  );
}