import type { Metadata } from "next";
import Link from "next/link";
import { buildMetadata } from "@/lib/seo";
import { getAdminTasks } from "@/lib/admin/tasks/api";
import { AdminTasksExplorer } from "@/components/admin/tasks/admin-tasks-explorer";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "Tasks",
  description: "All tasks currently onboarded on DevTunnel.",
  path: "/admin/tasks",
  // Private application UI, never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

interface AdminTasksPageProps {
  /**
   * `?project=<slug>` — arrives here via a Project's "Tasks" row action
   * (`AdminProjectsTable`), pre-filtering the list to that project rather
   * than opening a separate `/admin/projects/:id/tasks` route that isn't
   * part of the spec's page list (section 29).
   */
  searchParams?: { project?: string };
}

/**
 * `/admin/tasks` — Admin Portal Master Coding Specification, section 13
 * ("Task Page") / A12 in the final page list (section 29).
 *
 * Each task shows: Task, Project, GitHub Issue, Role, Difficulty, Tech
 * stack, Active/Completed Contributors, Submission Count, and Status
 * (section 13 ▸ Frontend; section 14 — "People Doing Tasks"), plus a
 * "Deleted in DevTunnel" view (section 15) — all handled by
 * `AdminTasksExplorer`, which layers search + filters (difficulty, role,
 * tech stack, author, GitHub repository, project, status) on top of one
 * `GET /admin/tasks` fetch.
 *
 * That endpoint isn't built on the backend yet (see
 * `lib/admin/tasks/api.ts`), so — same convention as the Projects page —
 * a failed or empty fetch degrades to one honest `SectionMessage`
 * instead of a fabricated table or a blank page
 * (Frontend_Development_Rules.txt rule 58).
 */
export default async function AdminTasksPage({ searchParams }: AdminTasksPageProps) {
  const result = await getAdminTasks();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="m-0 mb-1 text-xl font-medium text-text">Tasks</h1>
          <p className="m-0 text-sm text-text-muted">
            All tasks currently onboarded on DevTunnel.
          </p>
        </div>
        <Link
          href="/admin/tasks/new"
          className="inline-flex shrink-0 items-center rounded-[8px] bg-accent px-4 py-2 text-[13px] font-medium text-accent-foreground hover:bg-accent/90"
        >
          Create task
        </Link>
      </div>

      {result.status === "error" ? (
        <SectionMessage>Tasks aren&apos;t available yet — check back soon.</SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>
          No tasks have been onboarded yet. Start with{" "}
          <Link href="/admin/tasks/new" className="text-text-secondary hover:text-accent">
            Task Onboarding
          </Link>
          .
        </SectionMessage>
      ) : (
        <AdminTasksExplorer tasks={result.data} initialProjectSlug={searchParams?.project ?? "ALL"} />
      )}
    </main>
  );
}