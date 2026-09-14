import { SkeletonBlock, SkeletonStatCards } from "@/components/ui/skeleton";

/**
 * `/profile` — fetches `getServerUser`, `getServerContributionsSummary`,
 * `getServerDevTunnelContributionsSummary`, and `getServerDevTunnelStats`
 * in parallel (see the page's own comment on the four sources).
 */
export default function ProfileLoading() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-5" aria-hidden="true">
      <div className="mb-5 flex items-start gap-3.5">
        <SkeletonBlock className="h-14 w-14 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-3 w-24" />
        </div>
      </div>
      <SkeletonStatCards count={4} />
      <div className="mt-5 flex gap-4 border-b border-border pb-2">
        <SkeletonBlock className="h-3 w-32" />
        <SkeletonBlock className="h-3 w-16" />
        <SkeletonBlock className="h-3 w-28" />
      </div>
      <SkeletonBlock className="mt-4 h-[280px] w-full" />
    </div>
  );
}