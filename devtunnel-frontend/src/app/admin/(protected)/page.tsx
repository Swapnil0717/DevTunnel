import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getServerUser } from "@/lib/auth/get-server-user";
import { getAdminAuthMe } from "@/lib/admin/auth/api";
import { getAdminProjects } from "@/lib/admin/projects/api";
import { getAdminTasks } from "@/lib/admin/tasks/api";
import { getAiDiscoveryStatus } from "@/lib/admin/ai-discovery/api";
import { getRecentAdminActivity } from "@/lib/admin/activity/api";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminTractionChart } from "@/components/admin/admin-traction-chart";
import { AdminActivityTable } from "@/components/admin/activity/admin-activity-table";
import { SectionMessage } from "@/components/home/section-message";
import RouteLoading from "./loading";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";

export const metadata: Metadata = buildMetadata({
  title: "Admin dashboard",
  description: "DevTunnel Admin Portal — curate and publish open source projects.",
  path: "/admin",
  noIndex: true,
});

/**
 * `/admin` — Admin Portal Master Coding Specification, section 3.
 * Total Projects/Tasks/Submitted/Completed/Open are derived from the
 * already-shipped `GET /admin/projects` and `GET /admin/tasks`.
 * Total Users / Active Contributors stay an honest "—" — no admin
 * endpoint answers either without fabricating a number.
 */
export default async function AdminDashboardPage() {
  const [user, authMe, projectsResult, tasksResult, aiStatusResult, recentActivityResult] =
    await Promise.all([
      getServerUser(),
      getAdminAuthMe(),
      getAdminProjects(),
      getAdminTasks(),
      getAiDiscoveryStatus(),
      getRecentAdminActivity(5),
    ]);

  const projects = projectsResult.status === "ok" ? projectsResult.data : [];
  const tasks = tasksResult.status === "ok" ? tasksResult.data : [];

  const totalProjects = projectsResult.status === "error" ? null : projects.length;
  const totalTasks = tasksResult.status === "error" ? null : tasks.length;
  const tasksSubmitted =
    tasksResult.status === "error"
      ? null
      : tasks.reduce((sum, task) => sum + task.submissionCount, 0);
  const completedTasks =
    tasksResult.status === "error"
      ? null
      : tasks.filter((task) => task.status === "DONE").length;
  const openTasks =
    tasksResult.status === "error"
      ? null
      : tasks.filter((task) => task.status === "OPEN").length;

  const primaryStats: { label: string; value: number | null }[] = [
    { label: "Total users", value: null },
    { label: "Total projects", value: totalProjects },
    { label: "Total tasks", value: totalTasks },
    { label: "Tasks submitted", value: tasksSubmitted },
  ];

  const secondaryStats: { label: string; value: number | null }[] = [
    { label: "Active contributors", value: null },
    { label: "Completed tasks", value: completedTasks },
    { label: "Open DevTunnel tasks", value: openTasks },
  ];

  return (
    <BlueprintReveal skeleton={<RouteLoading />} className="relative isolate min-h-screen w-full">
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">Admin dashboard</h1>
        <p className="m-0 mb-8 text-sm text-text-muted">
          Signed in as <strong className="text-text">{user?.username}</strong>
          {user?.name ? ` (${user.name})` : null} — admin access confirmed.
          {authMe ? ` ${authMe.permissions.length} permissions granted.` : null}
        </p>

        <section aria-labelledby="dashboard-stats-heading" className="mb-8">
          <h2 id="dashboard-stats-heading" className="mb-2.5 text-[12.5px] font-normal text-text-muted">
            Platform overview
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {primaryStats.map((stat) => (
              <AdminStatCard key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </div>
        </section>

        <section aria-labelledby="dashboard-secondary-stats-heading" className="mb-8">
          <h2 id="dashboard-secondary-stats-heading" className="mb-2.5 text-[12.5px] font-normal text-text-muted">
            Contribution &amp; task activity
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {secondaryStats.map((stat) => (
              <AdminStatCard key={stat.label} label={stat.label} value={stat.value} />
            ))}
          </div>
        </section>

        <section aria-labelledby="dashboard-activity-heading" className="mb-8">
          <h2 id="dashboard-activity-heading" className="mb-2.5 text-[12.5px] font-normal text-text-muted">
            User activity
          </h2>
          <AdminTractionChart />
        </section>

        <section aria-labelledby="dashboard-ai-heading" className="mb-8">
          <h2 id="dashboard-ai-heading" className="mb-2.5 text-[12.5px] font-normal text-text-muted">
            AI discovery today
          </h2>
          {aiStatusResult.status === "error" ? (
            <SectionMessage>AI discovery status isn&apos;t available right now.</SectionMessage>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <AdminStatCard
                label="Projects proposed"
                value={
                  aiStatusResult.data.projectsBeginner +
                  aiStatusResult.data.projectsIntermediate +
                  aiStatusResult.data.projectsAdvanced
                }
              />
              <AdminStatCard label="Tools proposed" value={aiStatusResult.data.toolsFound} />
              <AdminStatCard label="Tasks proposed" value={aiStatusResult.data.tasksFound} />
              <AdminStatCard
                label="Project slots remaining"
                value={
                  aiStatusResult.data.projectsRemaining.beginner +
                  aiStatusResult.data.projectsRemaining.intermediate +
                  aiStatusResult.data.projectsRemaining.advanced
                }
              />
            </div>
          )}
          <div className="mt-3">
            <Link href="/admin/ai/confirmation" className="text-[12.5px] text-text-secondary hover:text-accent">
              Review the confirmation queue →
            </Link>
          </div>
        </section>

        <section aria-labelledby="dashboard-recent-activity-heading" className="mb-8">
          <div className="mb-2.5 flex items-center justify-between">
            <h2 id="dashboard-recent-activity-heading" className="text-[12.5px] font-normal text-text-muted">
              Recent activity
            </h2>
            <Link href="/admin/activity" className="text-[12.5px] text-text-secondary hover:text-accent">
              View all →
            </Link>
          </div>
          {recentActivityResult.status === "error" ? (
            <SectionMessage>Recent activity isn&apos;t available right now.</SectionMessage>
          ) : recentActivityResult.status === "empty" ? (
            <SectionMessage>No admin activity has been recorded yet.</SectionMessage>
          ) : (
            <AdminActivityTable entries={recentActivityResult.data} />
          )}
        </section>

        <div className="rounded-[10px] border border-border bg-surface px-6 py-5">
          <p className="m-0 mb-2 text-sm font-medium text-text">Quick actions</p>
          <p className="m-0 mb-4 text-[13px] leading-[1.6] text-text-muted">
            Projects, Tasks, AI discovery, Open Source Tools, and Activity are all live. Total
            Users and Active Contributors stay an honest{" "}
            <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-xs text-text-secondary">—</code>{" "}
            until a platform-wide user endpoint exists.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/projects/new" className="inline-flex items-center rounded-[8px] bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground hover:bg-accent/90">
              Start Project Onboarding
            </Link>
            <Link href="/admin/tasks/new" className="inline-flex items-center rounded-[8px] border border-border px-4 py-2 text-[13px] font-medium text-text hover:bg-surface-raised">
              Create task
            </Link>
            <Link href="/admin/opensource-tools/new" className="inline-flex items-center rounded-[8px] border border-border px-4 py-2 text-[13px] font-medium text-text hover:bg-surface-raised">
              Add open source tool
            </Link>
            <Link href="/admin/activity" className="inline-flex items-center rounded-[8px] border border-border px-4 py-2 text-[13px] font-medium text-text hover:bg-surface-raised">
              View activity log
            </Link>
          </div>
        </div>
      </main>
    </BlueprintReveal>
  );
}