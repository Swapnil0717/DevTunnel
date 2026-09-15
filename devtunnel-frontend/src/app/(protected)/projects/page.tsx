import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getRecommendedProjects } from "@/lib/home/api";
import { DevtunnelProjectsExplorer } from "@/components/projects/devtunnel-projects-explorer";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "Projects",
  description:
    "Browse projects curated on DevTunnel, searchable and filterable by tech stack, and sortable by how well they match your profile.",
  path: "/projects",
  // Private, authenticated-only application UI — never public content
  // (Frontend_Development_Rules.txt rule 18), same treatment
  // `/github-projects/page.tsx` documents for the same underlying
  // reason: this route lives under the `(protected)` route group, whose
  // layout (`app/(protected)/layout.tsx`) requires a backend-confirmed
  // session via `getServerUser()` for every page inside it, regardless
  // of what `middleware.ts`'s `PROTECTED_PREFIXES` list alone would
  // suggest.
  noIndex: true,
});

interface ProjectsPageProps {
  /** `?recommended=true` — the `RecommendedProjectsSection` "See all" link on `/home`. */
  searchParams?: { recommended?: string };
}

/**
 * `/projects` — "Projects on Devtunnel" in `AppSidebar`/`AppBottomNav`,
 * previously a dead link (the nav item existed, but no route did — same
 * gap `/github-projects/page.tsx` filled for its own nav entry).
 * Distinct from `/github-projects` ("GitHub Projects"): that's the live,
 * GitHub-wide catalog of real open-source repositories; this is
 * DevTunnel's own curated list — the projects DevTunnel has actually
 * onboarded, each with DevTunnel-side tasks and contributors (see
 * `lib/github-projects/types.ts`'s doc comment for the same distinction
 * from the other side) — for a contributor deciding which onboarded
 * project to actually start working in.
 *
 * Fetches the one real, spec'd endpoint for this list server-side
 * (`getRecommendedProjects`, `GET /projects/available` —
 * `lib/home/api.ts`; the same call `RecommendedProjectsList` already
 * makes for the home page's "Recommended for you" section) and hands the
 * full `ProjectSummary[]` to `DevtunnelProjectsExplorer` for
 * client-side search + filter (tech stack, recommended-only) + sort
 * (best match / name) + 12-per-page grid pagination — same "one fetch,
 * browser-side narrowing" shape `GithubProjectsExplorer` uses for
 * `/github-projects`.
 *
 * `?recommended=true` (the query string `RecommendedProjectsSection`'s
 * "See all" link already points at) seeds the explorer's "Show" filter
 * to "Recommended for you" on first render — read here, server-side,
 * rather than inside the client component, so no `useSearchParams` call
 * (and therefore no Suspense boundary) is needed just to support it.
 */
export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const result = await getRecommendedProjects();
  const initialShowFilter = searchParams?.recommended === "true" ? "RECOMMENDED" : "ALL";

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">Projects on Devtunnel</h1>
        <p className="m-0 text-sm text-text-muted">
          Projects curated on DevTunnel — search or filter by tech stack, or sort by how well
          each one matches your profile.
        </p>
      </div>

      {result.status === "error" ? (
        <SectionMessage>Projects aren&apos;t available yet — check back soon.</SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>No projects have been added yet — check back soon.</SectionMessage>
      ) : (
        <DevtunnelProjectsExplorer projects={result.data} initialShowFilter={initialShowFilter} />
      )}
    </main>
  );
}