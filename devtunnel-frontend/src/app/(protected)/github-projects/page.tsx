import type { Metadata } from "next";
import { Suspense } from "react";
import { buildMetadata } from "@/lib/seo";
import { getGithubProjects } from "@/lib/github-projects/api";
import { GithubProjectsExplorer } from "@/components/github-projects/github-projects-explorer";
import { SectionMessage } from "@/components/home/section-message";
import { SkeletonFilterBar, SkeletonGithubProjectCardGrid } from "@/components/ui/skeleton";

export const metadata: Metadata = buildMetadata({
  title: "GitHub Projects",
  description:
    "Explore real open-source repositories from across GitHub, searchable and filterable by tech stack, star count, and activity.",
  path: "/github-projects",
  // Private, authenticated-only application UI — never public content
  // (Frontend_Development_Rules.txt rule 18), same treatment
  // `/issues/page.tsx` documents for the same underlying reason: this
  // route lives under the `(protected)` route group, whose layout
  // (`app/(protected)/layout.tsx`) requires a backend-confirmed session
  // via `getServerUser()` for every page inside it, regardless of what
  // `middleware.ts`'s `PROTECTED_PREFIXES` list alone would suggest.
  noIndex: true,
});

/**
 * `/github-projects` — "GitHub Projects" in `AppSidebar`, previously a
 * dead link (the nav item existed, but no route did). Distinct from
 * `/projects` ("Projects on DevTunnel"): that's the curated list of
 * projects with DevTunnel-side tasks and contributors; this is a live,
 * GitHub-wide catalog of real open-source repositories — not limited to
 * projects DevTunnel has onboarded — stars, forks, license, topics,
 * activity (see `lib/github-projects/types.ts`) — for a contributor who
 * just wants to browse what's out there on GitHub before picking
 * something to dig into.
 *
 * Browsable with search + filters (tech stack, minimum stars, sort by
 * trending/most stars/newest/recently updated) and 12-per-page grid
 * pagination (`GithubProjectsExplorer`), layered on top of one
 * fully-fetched `GET /github-projects` list (`getGithubProjects` walks
 * the backend's keyset pagination in full — see
 * `lib/github-projects/api.ts`).
 */
export default async function GithubProjectsPage() {
  const result = await getGithubProjects();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">GitHub Projects</h1>
        <p className="m-0 text-sm text-text-muted">
          Real open-source projects from across GitHub — search or filter by tech stack, stars,
          and activity to find one worth exploring.
        </p>
      </div>

      {result.status === "error" ? (
        <SectionMessage>
          GitHub projects aren&apos;t available yet — check back soon.
        </SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>No GitHub projects have been added yet — check back soon.</SectionMessage>
      ) : (
        // GithubProjectsExplorer calls useSearchParams (to support an
        // optional catalog filter on sibling routes) — the App Router
        // requires that behind a Suspense boundary. `projects` is
        // already-resolved data, not something this Suspense is actually
        // waiting on, so the fallback below realistically never renders.
        <Suspense
          fallback={
            <>
              <SkeletonFilterBar filters={3} />
              <SkeletonGithubProjectCardGrid />
            </>
          }
        >
          <GithubProjectsExplorer projects={result.data} />
        </Suspense>
      )}
    </main>
  );
}