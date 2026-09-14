import { SkeletonBlock, SkeletonPageHeader, SkeletonQueueList } from "@/components/ui/skeleton";

/**
 * `/admin/ai/confirmation` — one `getAiConfirmationQueue()` fetch,
 * rendered as `AiBudgetOverview` (quota panel + budget-share editor)
 * followed by three separately-headed `AiDiscoveryQueue` card lists
 * (Projects, Tools, Tasks) — never a table.
 */
export default function AdminAiConfirmationLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader withAction={false} />
      <SkeletonBlock className="mb-8 h-[150px] w-full" />
      <div className="flex flex-col gap-8">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index}>
            <SkeletonBlock className="mb-3 h-3.5 w-32" />
            <SkeletonQueueList rows={2} />
          </div>
        ))}
      </div>
    </div>
  );
}