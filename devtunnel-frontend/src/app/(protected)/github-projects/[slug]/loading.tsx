import { SkeletonBlock, SkeletonDetailHeader } from "@/components/ui/skeleton";

/**
 * Next.js route-segment loading boundary for `/github-projects/:slug`.
 * Same shimmer-skeleton convention as
 * `/projects/:projectSlug/tasks/:taskId/loading.tsx`, trimmed to match
 * this page's own layout exactly: a logo'd header (`withLogo`) with two
 * action-button placeholders ("View on GitHub" + "Nominate for
 * DevTunnel"), then a tab bar and a single info-panel placeholder below
 * it — so nothing shifts position once `getGithubProjectBySlug()`
 * resolves and the real header, tabs, and Project Info panel swap in.
 */
export default function GithubProjectDetailLoading() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10" aria-hidden="true">
      <SkeletonDetailHeader
        withLogo
        meta={
          <>
            <SkeletonBlock className="h-3 w-40" />
            <span className="text-text-faint">·</span>
            <SkeletonBlock className="h-3 w-16" />
            <span className="text-text-faint">·</span>
            <SkeletonBlock className="h-3 w-20" />
            <span className="text-text-faint">·</span>
            <SkeletonBlock className="h-3 w-24" />
          </>
        }
        actions={
          <>
            <SkeletonBlock className="h-9 w-36" />
            <SkeletonBlock className="h-9 w-44" />
          </>
        }
      />

      <div className="mb-4 flex gap-4 border-b border-border-subtle pb-[9px]">
        <SkeletonBlock className="h-3.5 w-20" />
        <SkeletonBlock className="h-3.5 w-16" />
        <SkeletonBlock className="h-3.5 w-14" />
      </div>

      <div className="rounded-[10px] border border-border bg-surface p-5">
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[140px_1fr]">
          <SkeletonBlock className="h-2.5 w-20" />
          <SkeletonBlock className="h-2.5 w-3/5" />
          <SkeletonBlock className="h-2.5 w-24" />
          <SkeletonBlock className="h-2.5 w-16" />
          <SkeletonBlock className="h-2.5 w-14" />
          <SkeletonBlock className="h-2.5 w-20" />
          <SkeletonBlock className="h-2.5 w-14" />
          <SkeletonBlock className="h-2.5 w-10" />
          <SkeletonBlock className="h-2.5 w-14" />
          <SkeletonBlock className="h-2.5 w-10" />
        </div>
        <div className="mt-4 border-t border-border-subtle pt-4">
          <SkeletonBlock className="mb-2 h-2.5 w-20" />
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonBlock key={index} className="h-5 w-16 rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
