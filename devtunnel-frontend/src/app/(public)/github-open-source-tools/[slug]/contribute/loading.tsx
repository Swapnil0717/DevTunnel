import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintDetailHeader } from "@/components/ui/blueprint-kit";

/**
 * Route-segment loading boundary for `/github-open-source-tools/:slug/contribute`.
 *
 * Identical shape to `ProjectContributeLoading`
 * (`app/(public)/projects/[projectSlug]/contribute/loading.tsx`) — same
 * page layout, same blueprint-sheet convention — since this Contribute
 * route renders through the exact same components, just with a
 * `ContributeTarget` of kind `"github-repo"`.
 */
export default function GithubToolContributeLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 10.2 — Contribute"
      revLabel="Rev — loading guide"
      contentClassName="w-full mx-auto max-w-6xl px-6 py-10"
    >
      <BlueprintDetailHeader
        withLogo
        meta={
          <>
            <BlueprintFill className="h-3 w-40" />
            <span className="text-white/50">·</span>
            <BlueprintFill className="h-3 w-36" />
          </>
        }
        actions={
          <>
            <BlueprintFill className="h-9 w-[140px]" />
            <BlueprintFill className="h-9 w-[132px]" />
          </>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex gap-4 border-b border-white/15 pb-[9px]">
            {["w-[124px]", "w-[104px]", "w-[92px]"].map((width) => (
              <BlueprintFill key={width} className={`h-3 ${width}`} />
            ))}
          </div>

          <div className="rounded-[10px] border border-white/25 bg-white/[0.05] p-4">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {Array.from({ length: 4 }).map((_, index) => (
                <BlueprintFill key={index} className="h-6 w-20 rounded-[7px]" />
              ))}
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <BlueprintFill className="h-8 flex-1 rounded-[8px]" />
              <BlueprintFill className="h-8 w-28 rounded-[8px]" />
              <BlueprintFill className="h-8 w-28 rounded-[8px]" />
            </div>

            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-[9px] border border-white/15 bg-white/[0.05]-raised p-3.5"
                >
                  <BlueprintFill className="mb-2 h-3 w-2/3" />
                  <BlueprintFill className="mb-2.5 h-2.5 w-1/2" />
                  <div className="flex gap-1.5">
                    {Array.from({ length: 3 }).map((_, tagIndex) => (
                      <BlueprintFill key={tagIndex} className="h-5 w-14 rounded-md" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="flex w-full flex-col gap-4 lg:w-[280px] lg:shrink-0">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-[10px] border border-white/25 bg-white/[0.05] p-4">
              <BlueprintFill className="mb-3 h-2.5 w-24" />
              <div className="flex flex-col gap-2">
                {Array.from({ length: 4 }).map((_, rowIndex) => (
                  <BlueprintFill key={rowIndex} className="h-2.5 w-full" />
                ))}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </BlueprintSheet>
  );
}
