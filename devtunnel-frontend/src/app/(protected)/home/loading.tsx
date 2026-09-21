import { BlueprintBlock, BlueprintPlate, BlueprintSheet } from "@/components/ui/blueprint-loader";

/**
 * Route-level loading state for /home — the recent.design "portfolio
 * page load animation" reference, reproduced as-is: a blueprint drawing
 * sheet that builds itself in top to bottom in place of Home's real
 * content while the initial request is in flight.
 *
 * Block shapes are sized to Home's actual layout (see
 * `(protected)/home/page.tsx`) rather than the portfolio page's own —
 * header row, "Welcome back" heading, the journey card's three summary
 * rows (each carrying a dimension callout, the same touch the
 * reference's paragraph-shaped blocks use), then the three recommended
 * project cards as "PLATE 01/02/03", directly matching the reference's
 * own bottom row both in shape and in count
 * (`HOME_RECOMMENDED_PROJECT_LIMIT` is 3).
 */
export default function HomeLoading() {
  return (
    <BlueprintSheet sheetLabel="Sheet 01 — Home" revLabel="Rev — loading your workspace">
      {/* Header row: date on the left, avatar on the right. */}
      <div className="mb-7 flex items-center justify-between gap-4">
        <BlueprintBlock className="h-3 w-32" delayMs={0} />
        <div className="flex items-center gap-2.5">
          <BlueprintBlock className="h-3 w-20" delayMs={40} />
          <BlueprintBlock className="h-[30px] w-[30px]" rounded="rounded-full" delayMs={40} />
        </div>
      </div>

      {/* "Welcome back, {name}" heading. */}
      <BlueprintBlock className="mb-5 h-7 w-72" delayMs={100} />

      {/* Journey card: three summary rows, each with a dimension callout — the reference's paragraph treatment. */}
      <div className="mb-3 rounded-[4px] border border-white/25 p-4">
        <BlueprintBlock className="mb-3 h-2.5 w-40" delayMs={160} />
        <div className="mb-1.5 flex flex-col gap-3">
          <BlueprintBlock className="h-3.5 w-full" dimension="444" delayMs={220} />
          <BlueprintBlock className="h-3.5 w-full" dimension="477" delayMs={280} />
          <BlueprintBlock className="h-3.5 w-4/5" dimension="447" delayMs={340} />
        </div>
      </div>

      {/* Stat strip: three columns. */}
      <div className="mb-9 grid grid-cols-3 gap-3">
        {[400, 440, 480].map((delayMs, index) => (
          <div key={index} className="rounded-[4px] border border-white/25 p-3.5">
            <BlueprintBlock className="mb-2 h-2.5 w-16" delayMs={delayMs} />
            <BlueprintBlock className="h-6 w-10" delayMs={delayMs + 30} />
          </div>
        ))}
      </div>

      {/* Recommended projects: three plates, matching the reference's "PLATE 01/02/03" row 1-for-1. */}
      <BlueprintBlock className="mb-3 h-3 w-48" delayMs={520} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <BlueprintPlate label="Plate 01" delayMs={580} />
        <BlueprintPlate label="Plate 02" delayMs={640} />
        <BlueprintPlate label="Plate 03" delayMs={700} />
      </div>
    </BlueprintSheet>
  );
}
