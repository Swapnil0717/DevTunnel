// src/app/admin/(protected)/(shell)/opensource-tools/[id]/loading.tsx
import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintDetailHeader } from "@/components/ui/blueprint-kit";

/**
 * `/admin/opensource-tools/[id]` — `generateMetadata` and the page both
 * call `getAdminOpenSourceToolDetail`.
 *
 * Matches the real page's section order and internal shape:
 * - Back link + breadcrumb + square-logo/title row, a meta row (source
 *   URL · primary language), and both header actions (View source,
 *   Delete) — there's no stat-card row on this page, unlike Project/
 *   Task detail.
 * - `EditOpenSourceToolDetailsPanel`'s three *separate* bordered
 *   read-mode cards (Description, Labels, Setup & usage), each with its
 *   own heading + small "Edit" pill — not one flattened bar standing in
 *   for all three.
 * - The bordered README panel.
 */
export default function AdminOpenSourceToolDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet A4.1 — Tool"
      revLabel="Rev — loading tool"
      contentClassName="w-full mx-auto max-w-4xl px-6 py-10"
    >
      <BlueprintDetailHeader
        withLogo
        meta={
          <>
            <BlueprintFill className="h-3 w-48" />
            <span className="text-blueprint/50">·</span>
            <BlueprintFill className="h-3 w-16" />
          </>
        }
        actions={
          <>
            <BlueprintFill className="h-9 w-[118px]" />
            <BlueprintFill className="h-9 w-[92px]" />
          </>
        }
      />

      <div className="mb-8 rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <BlueprintFill className="h-2.5 w-24" />
          <BlueprintFill className="h-5 w-12" />
        </div>
        <BlueprintFill className="h-3 w-full" />
        <BlueprintFill className="mt-2 h-3 w-4/5" />
      </div>

      <div className="mb-8 rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <BlueprintFill className="h-2.5 w-14" />
          <BlueprintFill className="h-5 w-12" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <BlueprintFill key={index} className="h-5 w-14 rounded-md" />
          ))}
        </div>
      </div>

      <div className="mb-8 rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-5">
        <div className="mb-2 flex items-center justify-between gap-3">
          <BlueprintFill className="h-2.5 w-32" />
          <BlueprintFill className="h-5 w-12" />
        </div>
        <div className="flex flex-col gap-2">
          <BlueprintFill className="h-3 w-full" />
          <BlueprintFill className="h-3 w-full" />
          <BlueprintFill className="h-3 w-3/5" />
        </div>
      </div>

      <div className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-5">
        <BlueprintFill className="mb-2 h-2.5 w-20" />
        <BlueprintFill className="h-[260px] w-full" />
      </div>
    </BlueprintSheet>
  );
}