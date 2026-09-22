import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintStatCards } from "@/components/ui/blueprint-kit";

/**
 * `/profile` — fetches `getServerUser`, `getServerContributionsSummary`,
 * `getServerDevTunnelContributionsSummary`, `getServerDevTunnelStats`,
 * `getServerMilestoneWindow`, and `getServerProfileActivity` in parallel
 * (see the page's own comment on the six sources).
 *
 * Matches the real page's outer padding (`px-3 py-4 sm:px-[26px]
 * sm:py-[22px]`) and inner `max-w-[1100px]` bordered card
 * (`p-4 sm:p-8`) rather than a plain `max-w-[720px]` column, and adds
 * placeholders for `MilestoneTrack` (day strip + 5-checkpoint track +
 * 2 bonus-goal bars) and all 4 `ProfileTabs` tabs (Contribution
 * history, Projects, Tasks, Pull requests merged) — both previously
 * missing, so each shifted the page down the moment it mounted with
 * real data. The default-open "Contribution history" tab renders two
 * calendars side by side on `lg:`, so that's what its panel shows here
 * too, not one big block.
 */
export default function ProfileLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 03 — Profile"
      revLabel="Rev — loading your profile"
      contentClassName="px-3 py-4 sm:px-[26px] sm:py-[22px]"
    >
      <div className="mx-auto w-full max-w-[1100px] overflow-hidden rounded-xl border border-blueprint/25">
        <div className="p-4 sm:p-8">
          {/* Header: avatar + name/username/bio, "Edit profile" button. */}
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 gap-3.5">
              <BlueprintFill className="h-14 w-14 shrink-0 rounded-full" />
              <div className="flex flex-col gap-2">
                <BlueprintFill className="h-4 w-40" />
                <BlueprintFill className="h-3 w-32" />
                <BlueprintFill className="h-3 w-56" />
              </div>
            </div>
            <BlueprintFill className="h-8 w-28 shrink-0 self-start sm:self-auto" />
          </div>

          {/* Role/skill badge row. */}
          <div className="mb-5 flex flex-wrap gap-1.5">
            <BlueprintFill className="h-6 w-20 rounded-md" />
            <BlueprintFill className="h-6 w-16 rounded-md" />
            <BlueprintFill className="h-6 w-24 rounded-md" />
          </div>

          <BlueprintStatCards count={4} />

          {/* MilestoneTrack: label row, 30-day strip, 5-checkpoint track, 2 bonus-goal bars. */}
          <div className="mb-5 mt-5">
            <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2.5">
              <div className="flex flex-col gap-1.5">
                <BlueprintFill className="h-3 w-36" />
                <BlueprintFill className="h-2.5 w-56" />
              </div>
              <BlueprintFill className="h-5 w-24" />
            </div>
            <div className="rounded-lg border border-blueprint/15 px-3 py-3.5">
              <BlueprintFill className="mb-1 h-3.5 w-full" />
              <div className="mb-4 flex justify-between">
                <BlueprintFill className="h-2.5 w-16" />
                <BlueprintFill className="h-2.5 w-16" />
              </div>
              <div className="mx-[38px] mb-1.5 flex h-[84px] items-start justify-between">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="flex w-[74px] flex-col items-center gap-1.5">
                    <BlueprintFill className="h-[34px] w-[34px] rounded-full" delayMs={index * 60} />
                    <BlueprintFill className="h-2 w-12" delayMs={index * 60} />
                  </div>
                ))}
              </div>
              <BlueprintFill className="mx-auto h-2.5 w-48" />
            </div>
            <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <BlueprintFill className="h-[52px] w-full rounded-lg" />
              <BlueprintFill className="h-[52px] w-full rounded-lg" />
            </div>
          </div>

          {/* ProfileTabs: 4 tabs, default "Contribution history" panel = 2 calendars side by side on lg. */}
          <div className="mb-3.5 flex gap-4 border-b border-blueprint/15 pb-[9px]">
            <BlueprintFill className="h-3 w-36" />
            <BlueprintFill className="h-3 w-16" />
            <BlueprintFill className="h-3 w-12" />
            <BlueprintFill className="h-3 w-40" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <BlueprintFill className="mb-2 h-2.5 w-16" />
              <BlueprintFill className="h-[160px] w-full" />
            </div>
            <div>
              <BlueprintFill className="mb-2 h-2.5 w-32" />
              <BlueprintFill className="h-[160px] w-full" />
            </div>
          </div>
        </div>
      </div>
    </BlueprintSheet>
  );
}
