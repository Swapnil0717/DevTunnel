import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintDetailHeader } from "@/components/ui/blueprint-kit";

/**
 * Route-segment loading boundary for `/submissions/:slug` (and its
 * `/edit` child). Without its own, navigating here would show the list
 * page's skeleton from `../loading.tsx` — a stack of cards where a
 * detail page is about to appear. Shaped to the real page instead: a
 * logo'd header with its action buttons, then the main column's cards
 * beside the right-hand rail, so nothing shifts when
 * `getSubmissionBySlug()` resolves.
 */
export default function SubmissionDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 11.1 — Submission"
      revLabel="Rev — loading submission"
      contentClassName="w-full mx-auto max-w-5xl px-6 py-10"
    >
      <BlueprintDetailHeader
        withLogo
        meta={
          <>
            <BlueprintFill className="h-3 w-16" />
            <span className="text-white/50">·</span>
            <BlueprintFill className="h-3 w-40" />
            <span className="text-white/50">·</span>
            <BlueprintFill className="h-3 w-24" />
          </>
        }
        actions={
          <>
            <BlueprintFill className="h-9 w-32" />
            <BlueprintFill className="h-9 w-24" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
            <BlueprintFill className="mb-3 h-2.5 w-14" />
            <BlueprintFill className="mb-2 h-3 w-full" />
            <BlueprintFill className="h-3 w-2/3" />
          </div>
          <div className="rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[140px_1fr]">
              <BlueprintFill className="h-2.5 w-20" />
              <BlueprintFill className="h-2.5 w-2/5" />
              <BlueprintFill className="h-2.5 w-24" />
              <BlueprintFill className="h-2.5 w-16" />
              <BlueprintFill className="h-2.5 w-20" />
              <BlueprintFill className="h-2.5 w-1/2" />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5 border-t border-white/15 pt-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <BlueprintFill key={index} className="h-5 w-16 rounded-md" />
              ))}
            </div>
          </div>
          <div className="rounded-[10px] border border-white/25 bg-white/[0.05] p-5">
            <BlueprintFill className="mb-3 h-2.5 w-16" />
            <BlueprintFill className="mb-2 h-3 w-full" />
            <BlueprintFill className="mb-2 h-3 w-5/6" />
            <BlueprintFill className="h-3 w-3/4" />
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
          <BlueprintFill className="h-32 w-full rounded-[10px]" />
          <BlueprintFill className="h-40 w-full rounded-[10px]" />
        </div>
      </div>
    </BlueprintSheet>
  );
}
