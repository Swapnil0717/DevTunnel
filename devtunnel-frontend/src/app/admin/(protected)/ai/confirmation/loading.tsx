import { SkeletonPageHeader, SkeletonTable } from "@/components/ui/skeleton";

/** `/admin/ai/confirmation` — one `getAiConfirmationQueue()` fetch, same table shape as the other AI queue pages. */
export default function AdminAiConfirmationLoading() {
  return (
    <div aria-hidden="true">
      <SkeletonPageHeader withAction={false} />
      <SkeletonTable rows={6} columns={4} />
    </div>
  );
}