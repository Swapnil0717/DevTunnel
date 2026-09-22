import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill } from "@/components/ui/blueprint-kit";

/**
 * `/submissions/:slug/edit` — awaits `getSubmissionBySlug` before
 * rendering the back link + logo/title header and `EditSubmissionForm`
 * (itself `DetailsStep`: a description-choice pair, the always-visible
 * README panel, a tag-input tech stack, and the "alternative to paid
 * software" toggle, then a Cancel/Save footer row) — matching the
 * page's own `mx-auto max-w-3xl px-6 py-10` column.
 */
export default function EditSubmissionLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 11.3 — Edit submission"
      revLabel="Rev — loading submission"
      contentClassName="mx-auto max-w-3xl px-6 py-10"
    >
      <BlueprintFill className="mb-4 h-3 w-36" />

      <div className="mb-8 flex items-center gap-4">
        <BlueprintFill className="h-12 w-12 shrink-0 rounded-[10px]" />
        <div className="flex flex-1 flex-col gap-2">
          <BlueprintFill className="h-5 w-52" />
          <BlueprintFill className="h-3 w-full max-w-[420px]" />
        </div>
      </div>

      {/* Description choice: two option cards. */}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <BlueprintFill className="h-20 w-full rounded-[10px]" />
        <BlueprintFill className="h-20 w-full rounded-[10px]" />
      </div>

      {/* README panel — always visible on this step. */}
      <div className="mb-5 rounded-[10px] border border-blueprint/25 p-4">
        <BlueprintFill className="mb-3 h-2.5 w-24" />
        <BlueprintFill className="mb-2 h-3 w-full" />
        <BlueprintFill className="mb-2 h-3 w-full" />
        <BlueprintFill className="h-3 w-2/3" />
      </div>

      {/* Tech stack tag input. */}
      <div className="mb-5">
        <BlueprintFill className="mb-2 h-2.5 w-20" />
        <div className="flex flex-wrap gap-1.5">
          <BlueprintFill className="h-6 w-16 rounded-full" />
          <BlueprintFill className="h-6 w-20 rounded-full" />
          <BlueprintFill className="h-6 w-14 rounded-full" />
          <BlueprintFill className="h-6 w-9 rounded-full" />
        </div>
      </div>

      {/* "Alternative to paid software" toggle + tag input. */}
      <div className="mb-8 rounded-[10px] border border-blueprint/25 p-4">
        <BlueprintFill className="h-4 w-56" />
      </div>

      <div className="flex items-center justify-between border-t border-blueprint/15 pt-5">
        <BlueprintFill className="h-9 w-20" />
        <BlueprintFill className="h-9 w-32" />
      </div>
    </BlueprintSheet>
  );
}
