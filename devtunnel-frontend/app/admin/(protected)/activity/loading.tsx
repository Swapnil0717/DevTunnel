// src/app/admin/(protected)/activity/loading.tsx
import { SkeletonPageHeader, SkeletonFilterBar, SkeletonTable } from "@/components/ui/skeleton";

/**
 * `/admin/activity` — one `getAdminActivityLog()` fetch, rendered as
 * `AdminActivityExplorer`'s search + 2 filters atop `AdminActivityTable`
 * (Time, Action, Resource, Admin, Result, Details — 6 columns). No
 * header action button — this page has none, unlike Projects/Tasks/
 * Open Source Tools.
 */
export default function AdminActivityLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10" aria-hidden="true">
      <SkeletonPageHeader withAction={false} />
      <SkeletonFilterBar filters={2} />
      <SkeletonTable rows={8} columns={6} />
    </main>
  );
}