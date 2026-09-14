import { SkeletonPageHeader, SkeletonTable } from "@/components/ui/skeleton";

/** `/admin/ai/tasks` — one `getAiDiscoveredTasks("PENDING")` fetch, same queue-table shape as `/admin/ai/projects`. */
export default function AdminAiTasksLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader withAction={false} />
      <SkeletonTable rows={6} columns={4} />
    </div>
  );
}