import { BlueprintSheet } from "@/components/ui/blueprint-loader";
import { BlueprintFill, BlueprintStatCards } from "@/components/ui/blueprint-kit";

/**
 * `/profile` — fetches `getServerUser`, `getServerContributionsSummary`,
 * `getServerDevTunnelContributionsSummary`, and `getServerDevTunnelStats`
 * in parallel (see the page's own comment on the four sources).
 */
export default function ProfileLoading() {
  return (
    <BlueprintSheet
      sheetLabel="Sheet 03 — Profile"
      revLabel="Rev — loading your profile"
      contentClassName="mx-auto w-full max-w-[720px] px-4 py-5"
    >
      <div className="mb-5 flex items-start gap-3.5">
        <BlueprintFill className="h-14 w-14 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <BlueprintFill className="h-4 w-40" />
          <BlueprintFill className="h-3 w-24" />
        </div>
      </div>
      <BlueprintStatCards count={4} />
      <div className="mt-5 flex gap-4 border-b border-white/25 pb-2">
        <BlueprintFill className="h-3 w-32" />
        <BlueprintFill className="h-3 w-16" />
        <BlueprintFill className="h-3 w-28" />
      </div>
      <BlueprintFill className="mt-4 h-[280px] w-full" />
    </BlueprintSheet>
  );
}