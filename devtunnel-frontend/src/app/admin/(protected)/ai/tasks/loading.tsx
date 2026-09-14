import { SkeletonBlock, SkeletonPageHeader, SkeletonQueueList } from "@/components/ui/skeleton";

/** `/admin/ai/tasks` — one `getAiDiscoveredTasks("PENDING")` fetch, rendered as `AiDiscoveryRunButton` (quota panel + run button) followed by `AiDiscoveryQueue`'s card list — never a table. */
export default function AdminAiTasksLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader withAction={false} />
      <SkeletonBlock className="mb-8 h-[110px] w-full" />
      <SkeletonQueueList rows={4} />
    </div>
  );
}