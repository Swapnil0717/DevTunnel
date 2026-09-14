import { SkeletonPageHeader, SkeletonTable } from "@/components/ui/skeleton";

/** `/admin/activity` — one `getAdminActivityLog()` fetch, rendered as `AdminActivityTable`/`AdminActivityExplorer`. */
export default function AdminActivityLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader actions={0} />
      <SkeletonTable rows={8} columns={5} />
    </div>
  );
}