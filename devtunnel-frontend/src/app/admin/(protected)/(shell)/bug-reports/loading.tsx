// src/app/admin/(protected)/(shell)/bug-reports/loading.tsx
import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintPageHeader, BlueprintTable } from "@/components/ui/blueprint-kit";

/**
 * `/admin/bug-reports` — one page of reports (the page makes a single fetch).
 * No header action button and no filters; the list is read-only.
 */
export default function AdminBugReportsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A1 — Bug reports"
      revLabel="Rev — loading bug reports"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader withAction={false} />
      <BlueprintTable
        rows={5}
        headings={["Report", "Where", "How bad", "Reporter", "Sent"]}
        twoLineColumns={1}
      />
    </BlueprintSheet>
  );
}
