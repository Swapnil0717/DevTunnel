import { SkeletonAvatarHeader, SkeletonBlock, SkeletonStatCards } from "@/components/ui/skeleton";

/**
 * `/profile` — fetches `getServerUser`, `getServerContributionsSummary`,
 * `getServerDevTunnelContributionsSummary`, and `getServerDevTunnelStats`
 * in parallel (see the page's own comment on the four sources).
 */
export default function ProfileLoading() {
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-5" aria-hidden="true">
      <SkeletonAvatarHeader />
      <SkeletonStatCards count={4} />
      <SkeletonBlock className="mt-5 h-[280px] w-full" />
    </div>
  );
}