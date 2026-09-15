import {
    SkeletonPageHeader,
    SkeletonFilterBar,
    SkeletonGithubProjectCardGrid,
  } from "@/components/ui/skeleton";
  
  /**
   * Next.js route-segment loading boundary for `/github-projects`
   * ("GitHub Projects"). Wrapped in the exact same page shell the real
   * page renders (`mx-auto max-w-6xl px-6 py-10`, `SkeletonPageHeader`,
   * and a 3-filter `SkeletonFilterBar` matching `GithubProjectsExplorer`'s
   * real filter bar — Tech stack, Minimum stars, Sort by) so nothing
   * shifts position once `getGithubProjects()` resolves — only the grid
   * below the filters swaps from placeholders to real cards.
   *
   * Unlike `/issues/loading.tsx`, this renders a real skeleton grid
   * (`SkeletonGithubProjectCardGrid`) instead of a spinner:
   * `getGithubProjects()` reads a published, DB-backed repository catalog
   * (`lib/github-projects/api.ts`), not a live, re-scanned-on-every-request
   * GitHub crawl the way `/issues` is — so mirroring the real grid here is
   * an honest "this is a normal page load" signal, not a false "almost
   * done" one.
   */
  export default function GithubProjectsLoading() {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10">
        <SkeletonPageHeader withAction={false} />
        <SkeletonFilterBar filters={3} />
        <SkeletonGithubProjectCardGrid />
      </main>
    );
  }