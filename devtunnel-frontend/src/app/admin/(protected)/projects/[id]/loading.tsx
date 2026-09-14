import { SkeletonAvatarHeader, SkeletonBlock, SkeletonLines, SkeletonStatCards } from "@/components/ui/skeleton";

/**
 * `/admin/projects/[id]` — `generateMetadata` and the page component each
 * call `getAdminProjectDetail`, plus a second parallel `getAdminProjectTasks`
 * fetch (see the page's own comment on why those two run together via
 * `Promise.all` rather than one after the other).
 */
export default function AdminProjectDetailLoading() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <SkeletonAvatarHeader />
      <SkeletonStatCards count={4} />
      <SkeletonLines count={3} />
      <SkeletonBlock className="h-64 w-full" />
    </div>
  );
}