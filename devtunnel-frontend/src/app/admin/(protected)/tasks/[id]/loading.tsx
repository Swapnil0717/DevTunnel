import { SkeletonAvatarHeader, SkeletonBlock, SkeletonLines } from "@/components/ui/skeleton";

/** `/admin/tasks/[id]` — `generateMetadata` and the page both call `getAdminTaskDetail`, same shape as the Project/Tool detail pages. */
export default function AdminTaskDetailLoading() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <SkeletonAvatarHeader />
      <SkeletonLines count={3} />
      <SkeletonBlock className="h-48 w-full" />
    </div>
  );
}