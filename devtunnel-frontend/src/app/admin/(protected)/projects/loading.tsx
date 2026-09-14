// src/app/admin/(protected)/projects/loading.tsx
import { SkeletonBlock, SkeletonPageHeader, SkeletonFilterBar, SkeletonTable } from "@/components/ui/skeleton";

/**
 * `/admin/projects` — one `getAdminProjects()` fetch, rendered as
 * `AdminProjectsExplorer`'s search + Author/Tech stack/Status filters
 * atop `AdminProjectsTable` (8 columns). Header has two right-hand
 * actions ("Sync all GitHub data", "Onboard a project"), matching the
 * real page — the only list page with two.
 */
export default function AdminProjectsLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10" aria-hidden="true">
      <SkeletonPageHeader
        actions={
          <div className="flex flex-wrap items-start gap-3">
            <SkeletonBlock className="h-9 w-[168px]" />
            <SkeletonBlock className="h-9 w-[150px]" />
          </div>
        }
      />
      <SkeletonFilterBar filters={3} />
      <SkeletonTable rows={8} columns={8} />
    </main>
  );
}