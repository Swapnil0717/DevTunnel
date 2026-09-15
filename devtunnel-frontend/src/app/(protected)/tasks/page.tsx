import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getTasks } from "@/lib/tasks/api";
import { TasksExplorer } from "@/components/tasks/tasks-explorer";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "Tasks",
  description:
    "Every task DevTunnel currently provides to contributors, searchable and filterable by role, difficulty, tech stack, and project.",
  path: "/tasks",
  // Private, authenticated-only application UI — never public content (Frontend_Development_Rules.txt rule 18).
  noIndex: true,
});

/**
 * `/tasks` — "Tasks" in `AppSidebar` / `AppBottomNav`. The
 * contributor-facing counterpart to the Admin Portal's `/admin/tasks`
 * page: every active DevTunnel task, browsable with search + filters and
 * 10-per-page pagination (`TasksExplorer`), layered on top of one
 * fully-fetched `GET /tasks` list (`getTasks` walks the backend's keyset
 * pagination in full — see `lib/tasks/api.ts`).
 *
 * Unlike the Admin page, there's no Edit/Delete here, and no "Deleted in
 * DevTunnel" tab — both curate DevTunnel's task list, an Admin
 * responsibility. This page is read-only browsing for a contributor
 * deciding what to work on next, with Role/Difficulty/Tech-stack filters
 * that map onto the same three questions the onboarding form itself
 * already asked them (see `TasksExplorer`'s own doc comment).
 */
export default async function TasksPage() {
  const result = await getTasks();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">Tasks</h1>
        <p className="m-0 text-sm text-text-muted">
          Every task DevTunnel currently provides to contributors — search or filter by role,
          difficulty, tech stack, or project to find something to work on.
        </p>
      </div>

      {result.status === "error" ? (
        <SectionMessage>Tasks aren&apos;t available yet — check back soon.</SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>No tasks have been onboarded yet.</SectionMessage>
      ) : (
        <TasksExplorer tasks={result.data} />
      )}
    </main>
  );
}
