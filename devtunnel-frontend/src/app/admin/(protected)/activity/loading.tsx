// src/app/admin/(protected)/activity/loading.tsx
import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintPageHeader, BlueprintFilterBar, BlueprintTable } from "@/components/ui/blueprint-kit";

/**
 * `/admin/activity` — one `getAdminActivityLog()` fetch, rendered as
 * `AdminActivityExplorer`'s search + 2 filters atop `AdminActivityTable`
 * (Time, Action, Resource, Admin, Result, Details — 6 columns). No
 * header action button — this page has none, unlike Projects/Tasks/
 * Open Source Tools.
 */
export default function AdminActivityLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A1 — Activity"
      revLabel="Rev — loading activity"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader withAction={false} />
      <BlueprintFilterBar filters={2} />
      <BlueprintTable rows={8} columns={6} />
    </BlueprintSheet>
  );
}