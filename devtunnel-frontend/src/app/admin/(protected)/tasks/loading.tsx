// src/app/admin/(protected)/tasks/loading.tsx
import { SkeletonBlock, SkeletonPageHeader, SkeletonFilterBar, SkeletonTable } from "@/components/ui/skeleton";

/**
 * `/admin/tasks` — one `getAdminTasks()` fetch, rendered as
 * `AdminTasksExplorer`'s search + 7 filters (difficulty, role, tech
 * stack, author, GitHub repository, project, status) atop
 * `AdminTasksTable`. Header has one right-hand action ("Create task"),
 * matching the real page — not the generic default button width.
 */
export default function AdminTasksLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10" aria-hidden="true">
      <SkeletonPageHeader actions={<SkeletonBlock className="h-9 w-[108px]" />} />
      <SkeletonFilterBar filters={7} />
      <SkeletonTable rows={8} columns={7} />
    </main>
  );
}