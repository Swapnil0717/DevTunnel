import { SkeletonPageHeader, SkeletonTable } from "@/components/ui/skeleton";

/** `/admin/projects` — one `getAdminProjects()` fetch, rendered as `AdminProjectsTable` (8 columns). */
export default function AdminProjectsLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader />
      <SkeletonTable rows={8} columns={8} />
    </div>
  );
}