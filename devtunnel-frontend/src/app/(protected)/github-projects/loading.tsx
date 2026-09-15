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
 * Renders a real skeleton grid (`SkeletonGithubProjectCardGrid`) rather
 * than a spinner: `getGithubProjects()` (`lib/github-projects/api.ts`)
 * is backed by a live GitHub-wide catalog, but the backend caches that
 * scan for 30 minutes (src/routes/githubProjects.ts), so most loads —
 * like `/issues`'s own shared-cache reads — resolve fast enough that a
 * real grid skeleton reads as a normal page load, not a false "almost
 * done" signal.
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