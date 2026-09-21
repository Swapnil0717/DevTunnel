// src/app/admin/(protected)/projects/loading.tsx
import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintPageHeader, BlueprintFilterBar, BlueprintTable } from "@/components/ui/blueprint-kit";

/**
 * `/admin/projects` — one `getAdminProjects()` fetch, rendered as
 * `AdminProjectsExplorer`'s search + Author/Tech stack/Status filters
 * atop `AdminProjectsTable` (8 columns). Header has two right-hand
 * actions ("Sync all GitHub data", "Onboard a project"), matching the
 * real page — the only list page with two.
 */
export default function AdminProjectsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A2 — Projects"
      revLabel="Rev — loading projects"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader
        actions={
          <div className="flex flex-wrap items-start gap-3">
            <BlueprintFill className="h-9 w-[168px]" />
            <BlueprintFill className="h-9 w-[150px]" />
          </div>
        }
      />
      <BlueprintFilterBar filters={3} />
      <BlueprintTable rows={8} columns={8} />
    </BlueprintSheet>
  );
}