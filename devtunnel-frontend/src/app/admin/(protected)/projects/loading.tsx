import { SkeletonPageHeader, SkeletonFilterBar, SkeletonTable } from "@/components/ui/skeleton";

/** `/admin/projects` — one `getAdminProjects()` fetch, rendered as `AdminProjectsExplorer`'s search + Author/Tech stack/Status filters atop `AdminProjectsTable` (8 columns). */
export default function AdminProjectsLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader />
      <SkeletonFilterBar filters={3} />
      <SkeletonTable rows={8} columns={8} />
    </div>
  );
}