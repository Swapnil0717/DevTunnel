import { SkeletonPageHeader, SkeletonFilterBar, SkeletonTable } from "@/components/ui/skeleton";

/** `/admin/tasks` — one `getAdminTasks()` fetch, rendered as `AdminTasksExplorer`'s search + 7 filters (difficulty, role, tech stack, author, GitHub repository, project, status) atop `AdminTasksTable`. */
export default function AdminTasksLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader />
      <SkeletonFilterBar filters={7} />
      <SkeletonTable rows={8} columns={7} />
    </div>
  );
}