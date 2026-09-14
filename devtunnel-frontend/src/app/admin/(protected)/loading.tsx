import { SkeletonBlock, SkeletonStatCards } from "@/components/ui/skeleton";

/**
 * `/admin` dashboard loading boundary. The page fires 6 requests in
 * parallel (`getServerUser`, `getAdminAuthMe`, `getAdminProjects`,
 * `getAdminTasks`, `getAiDiscoveryStatus`, `getRecentAdminActivity`) —
 * each is a fast indexed query on its own, but rendered together this
 * gives the first paint something to show instead of a blank panel
 * while all six resolve.
 */
export default function AdminDashboardLoading() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <SkeletonBlock className="h-6 w-48" />
      <SkeletonStatCards count={5} />
      <SkeletonBlock className="h-[220px] w-full" />
      <SkeletonBlock className="h-3 w-32" />
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonBlock key={index} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}