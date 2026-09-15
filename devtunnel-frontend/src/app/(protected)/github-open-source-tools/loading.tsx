import {
  SkeletonPageHeader,
  SkeletonFilterBar,
  SkeletonGithubProjectCardGrid,
} from "@/components/ui/skeleton";

/**
 * Next.js route-segment loading boundary for `/github-open-source-tools`
 * ("Github Open source tools"). Same shell as `/github-projects/loading.tsx`
 * (`SkeletonPageHeader`, a 4-filter `SkeletonFilterBar` matching
 * `GithubProjectsExplorer`'s real filter bar, and a real skeleton grid
 * rather than a spinner — this catalog is backend-cached for 30 minutes
 * too, so most loads resolve fast enough for the real grid to read as a
 * normal page load).
 */
export default function GithubOpenSourceToolsLoading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <SkeletonPageHeader withAction={false} />
      <SkeletonFilterBar filters={4} />
      <SkeletonGithubProjectCardGrid />
    </main>
  );
}