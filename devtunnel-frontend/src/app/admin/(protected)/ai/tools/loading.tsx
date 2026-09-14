import { SkeletonPageHeader, SkeletonTable } from "@/components/ui/skeleton";

/** `/admin/ai/tools` — one `getAiDiscoveredTools("PENDING")` fetch, same queue-table shape as the other AI queue pages. */
export default function AdminAiToolsLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader withAction={false} />
      <SkeletonTable rows={6} columns={4} />
    </div>
  );
}