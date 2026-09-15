import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getGithubOpenSourceTools } from "@/lib/github-open-source-tools/api";
import { GithubProjectsExplorer } from "@/components/github-projects/github-projects-explorer";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "Github Open Source Tools",
  description:
    "Explore open-source developer tools from across GitHub — CLIs, libraries, and utilities — searchable and filterable by tech stack, star count, and activity.",
  path: "/github-open-source-tools",
  // Private, authenticated-only application UI — never public content
  // (Frontend_Development_Rules.txt rule 18), same treatment every other
  // `(protected)` route gives (see `/github-projects/page.tsx`).
  noIndex: true,
});

/**
 * `/github-open-source-tools` — "Github Open source tools" in
 * `AppSidebar`. Sibling of `/github-projects` ("GitHub Projects"): same
 * live, GitHub-wide catalog shape, narrowed backend-side to
 * repositories that read as developer tools (CLIs, libraries, dev-
 * workflow utilities) rather than general open-source projects — see
 * `src/routes/githubOpenSourceTools.ts`'s doc comment for the discovery
 * query.
 *
 * Distinct from `/opensource-tools` ("Open Source Tools on DevTunnel"):
 * that's DevTunnel's own curated, onboarded tool list; this is the
 * unfiltered, GitHub-wide catalog — same relationship `/github-projects`
 * has to `/projects` ("Projects on DevTunnel").
 *
 * Reuses `GithubProjectsExplorer` as-is (search + tech-stack/star
 * filters + trending/stars/newest/recently-updated sort + 12-per-page
 * grid pagination) rather than a parallel component — the underlying
 * data shape and card UI are identical to `/github-projects`, only the
 * catalog's population differs, and that's already handled backend-side
 * (`getGithubOpenSourceTools`).
 */
export default async function GithubOpenSourceToolsPage() {
  const result = await getGithubOpenSourceTools();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">Github Open Source Tools</h1>
        <p className="m-0 text-sm text-text-muted">
          Real open-source developer tools from across GitHub — search or filter by tech stack,
          stars, and activity to find one worth exploring.
        </p>
      </div>

      {result.status === "error" ? (
        <SectionMessage>
          GitHub open source tools aren&apos;t available yet — check back soon.
        </SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>No open source tools found — check back soon.</SectionMessage>
      ) : (
        <GithubProjectsExplorer projects={result.data} />
      )}
    </main>
  );
}