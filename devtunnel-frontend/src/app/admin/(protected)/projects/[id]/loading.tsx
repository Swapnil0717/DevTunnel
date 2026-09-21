// src/app/admin/(protected)/projects/[id]/loading.tsx
import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintDetailHeader, BlueprintStatCards } from "@/components/ui/blueprint-kit";

/**
 * `/admin/projects/[id]` — `generateMetadata` and the page component each
 * call `getAdminProjectDetail`, plus a second parallel `getAdminProjectTasks`
 * fetch (see the page's own comment on why those two run together via
 * `Promise.all` rather than one after the other).
 *
 * Matches the real page's section order and internal shape:
 * - Back link + breadcrumb + title, a 3-chip meta row (repo link ·
 *   @author · status badge), and all five header actions (View on
 *   GitHub, Edit details, Sync GitHub data, Archive/Reactivate project,
 *   Delete) — not a generic two-button placeholder.
 * - A 5-card contributor/task/issue stat row (`sm:grid-cols-5`, matching
 *   `AdminStatCard`'s own grid).
 * - `EditProjectDetailsPanel`'s two *separate* bordered read-mode cards
 *   (Description, Tech stack), each with its own heading + small "Edit"
 *   pill — not one flattened bar standing in for both. Tech stack is a
 *   `dl` of labeled rows (Language, Frontend, Backend, ...), each with
 *   its own tag pills, not one undifferentiated row of pills.
 * - The whole page wrapped in the same `mx-auto max-w-4xl px-6 py-10`
 *   `<main>` the real page renders inside, so the skeleton occupies the
 *   same column width instead of stretching full-bleed under the
 *   sidebar/header shell.
 * - The task list's heading row (with its own "View all" link), and
 *   each task row's actual left icon+title / right submissions+status
 *   shape rather than a single flat bar.
 * - The bordered README panel.
 */
export default function AdminProjectDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A2.1 — Project"
      revLabel="Rev — loading project"
      contentClassName="w-full mx-auto max-w-4xl px-6 py-10"
    >
      <BlueprintDetailHeader
        meta={
          <>
            <BlueprintFill className="h-3 w-40" />
            <span className="text-white/50">·</span>
            <BlueprintFill className="h-3 w-20" />
            <span className="text-white/50">·</span>
            <BlueprintFill className="h-4 w-16 rounded-full" />
          </>
        }
        actions={
          <>
            <BlueprintFill className="h-9 w-[130px]" />
            <BlueprintFill className="h-9 w-[124px]" />
            <BlueprintFill className="h-9 w-[152px]" />
            <BlueprintFill className="h-9 w-[140px]" />
            <BlueprintFill className="h-9 w-[92px]" />
          </>
        }
      />

      <div className="mb-8">
        <BlueprintFill className="mb-2.5 h-2.5 w-48" />
        <BlueprintStatCards count={5} />
      </div>

      <div className="mb-8 rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <BlueprintFill className="h-2.5 w-24" />
          <BlueprintFill className="h-5 w-12" />
        </div>
        <BlueprintFill className="h-3 w-full" />
        <BlueprintFill className="mt-2 h-3 w-4/5" />
      </div>

      <div className="mb-8 rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <BlueprintFill className="h-2.5 w-24" />
          <BlueprintFill className="h-5 w-12" />
        </div>
        <div className="flex flex-col gap-3">
          {[2, 1, 1, 2, 1].map((tagCount, rowIndex) => (
            <div key={rowIndex}>
              <BlueprintFill className="mb-1.5 h-2.5 w-16" />
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: tagCount }).map((_, tagIndex) => (
                  <BlueprintFill key={tagIndex} className="h-5 w-16 rounded-md" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-2.5 flex items-center justify-between">
          <BlueprintFill className="h-2.5 w-28" />
          <BlueprintFill className="h-2.5 w-14" />
        </div>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-white/25 bg-white/[0.05] px-4 py-3"
            >
              <BlueprintFill className="h-3.5 w-2/5" />
              <div className="flex shrink-0 items-center gap-3">
                <BlueprintFill className="h-2.5 w-16" />
                <BlueprintFill className="h-4 w-14 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
        <BlueprintFill className="mb-2 h-2.5 w-20" />
        <BlueprintFill className="h-[260px] w-full" />
      </div>
    </BlueprintSheet>
  );
}