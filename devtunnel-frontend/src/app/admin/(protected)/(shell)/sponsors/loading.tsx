// src/app/admin/(protected)/(shell)/sponsors/loading.tsx
import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintPageHeader, BlueprintFilterBar, BlueprintTable } from "@/components/ui/blueprint-kit";

/**
 * `/admin/sponsors` — the goal editor, then the sponsors table (the page
 * fetches the first page of rows and this month's goal). No header action
 * button: "Add manual sponsor" sits above the table, not in the header.
 */
export default function AdminSponsorsLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A1 — Sponsors"
      revLabel="Rev — loading sponsors"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader withAction={false} />
      <BlueprintFilterBar filters={2} />
      <BlueprintTable
        rows={6}
        headings={["Sponsor", "Amount", "Tier", "Status", "Source", "Paid", "Approved", "Hidden", "Actions"]}
        twoLineColumns={1}
      />
    </BlueprintSheet>
  );
}
