import { SkeletonAvatarHeader, SkeletonBlock, SkeletonLines } from "@/components/ui/skeleton";

/** `/admin/opensource-tools/[id]` — `generateMetadata` and the page both call `getAdminOpenSourceToolDetail`. */
export default function AdminOpenSourceToolDetailLoading() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <SkeletonAvatarHeader />
      <SkeletonLines count={4} />
      <SkeletonBlock className="h-40 w-full" />
    </div>
  );
}