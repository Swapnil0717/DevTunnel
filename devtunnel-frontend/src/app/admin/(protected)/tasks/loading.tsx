import { SkeletonPageHeader, SkeletonTable } from "@/components/ui/skeleton";

/** `/admin/tasks` — one `getAdminTasks()` fetch, rendered as `AdminTasksTable`. */
export default function AdminTasksLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader />
      <SkeletonTable rows={8} columns={7} />
    </div>
  );
}