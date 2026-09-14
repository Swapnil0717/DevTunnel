import { SkeletonPageHeader, SkeletonTable } from "@/components/ui/skeleton";

/** `/admin/ai/projects` — one `getAiDiscoveredProjects("PENDING")` fetch, rendered as a queue table. */
export default function AdminAiProjectsLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader withAction={false} />
      <SkeletonTable rows={6} columns={4} />
    </div>
  );
}