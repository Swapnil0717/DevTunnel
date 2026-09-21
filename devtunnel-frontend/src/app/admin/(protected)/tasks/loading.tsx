// src/app/admin/(protected)/tasks/loading.tsx
import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintPageHeader, BlueprintFilterBar, BlueprintTable } from "@/components/ui/blueprint-kit";

/**
 * `/admin/tasks` — one `getAdminTasks()` fetch, rendered as
 * `AdminTasksExplorer`'s search + 7 filters (difficulty, role, tech
 * stack, author, GitHub repository, project, status) atop
 * `AdminTasksTable`. Header has one right-hand action ("Create task"),
 * matching the real page — not the generic default button width.
 */
export default function AdminTasksLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A3 — Tasks"
      revLabel="Rev — loading tasks"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintPageHeader actions={<BlueprintFill className="h-9 w-[108px]" />} />
      <BlueprintFilterBar filters={7} />
      <BlueprintTable
        rows={8}
        headings={[
          "Task",
          "Project",
          "GitHub issue",
          "Role",
          "Difficulty",
          "Tech stack",
          "Contributors",
          "Submissions",
          "Status",
          "Actions",
        ]}
        twoLineColumns={2}
      />
    </BlueprintSheet>
  );
}