import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintDetailHeader } from "@/components/ui/blueprint-kit";

/**
 * Next.js route-segment loading boundary for `/opensource-tools/:toolSlug`.
 *
 * Same blueprint-sheet convention as
 * `/projects/:projectSlug/loading.tsx`, shaped to this page's own
 * layout so the swap to real content doesn't visibly reflow: logo +
 * header with its action buttons, then the two-column body — a tab strip
 * over one tall panel on the left, and the tool rail's stack of cards on
 * the right.
 *
 * Drawn with all three header buttons and the full rail. A tool with no
 * repository behind it ends up with one button fewer and two cards
 * fewer, but a skeleton can't know that before the fetch resolves, and
 * guessing the smaller shape would make the common case reflow instead.
 */
export default function ToolDetailLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 06.1 — Tool"
      revLabel="Rev — loading tool"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintDetailHeader
        withLogo
        meta={
          <>
            <BlueprintFill className="h-3 w-40" />
            <span className="text-blueprint/50">·</span>
            <BlueprintFill className="h-3 w-28" />
          </>
        }
        actions={
          <>
            <BlueprintFill className="h-9 w-[178px]" />
            <BlueprintFill className="h-9 w-[92px]" />
            <BlueprintFill className="h-9 w-[132px]" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex gap-4 border-b border-blueprint/15 pb-[9px]">
            {["w-20", "w-24", "w-20", "w-[82px]"].map((width) => (
              <BlueprintFill key={width} className={`h-3 ${width}`} />
            ))}
          </div>

          <div className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-5">
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[180px_1fr]">
              {Array.from({ length: 8 }).map((_, index) => (
                <BlueprintFill
                  key={index}
                  className={index % 2 === 0 ? "h-2.5 w-28" : "h-2.5 w-40"}
                />
              ))}
            </div>
            <div className="mt-4 border-t border-blueprint/15 pt-4">
              <BlueprintFill className="mb-2 h-2.5 w-20" />
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 5 }).map((_, index) => (
                  <BlueprintFill key={index} className="h-5 w-16 rounded-md" />
                ))}
              </div>
            </div>
          </div>
        </div>

        <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
          <div className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-4">
            <BlueprintFill className="mb-3 h-2.5 w-14" />
            <BlueprintFill className="mb-2 h-2.5 w-full" />
            <BlueprintFill className="mb-3.5 h-2.5 w-3/4" />
            <div className="mb-3.5 flex flex-wrap gap-1.5">
              {Array.from({ length: 3 }).map((_, index) => (
                <BlueprintFill key={index} className="h-5 w-14 rounded-md" />
              ))}
            </div>
            <div className="flex flex-col gap-2 border-t border-blueprint/15 pt-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <BlueprintFill key={index} className="h-2.5 w-full" />
              ))}
            </div>
          </div>

          <div className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-4">
            <BlueprintFill className="mb-3 h-2.5 w-20" />
            <div className="flex items-center gap-2.5">
              <BlueprintFill className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1">
                <BlueprintFill className="mb-1.5 h-2.5 w-24" />
                <BlueprintFill className="h-2.5 w-16" />
              </div>
            </div>
          </div>

          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-[10px] border border-blueprint/25 bg-blueprint/[0.05] p-4">
              <BlueprintFill className="mb-3 h-2.5 w-16" />
              <BlueprintFill className="h-8 w-full rounded-[8px]" />
            </div>
          ))}
        </aside>
      </div>
    </BlueprintSheet>
  );
}
