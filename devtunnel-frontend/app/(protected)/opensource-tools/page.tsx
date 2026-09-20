import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getOpenSourceTools } from "@/lib/opensource-tools/api";
import { DevtunnelOpenSourceToolsExplorer } from "@/components/opensource-tools/devtunnel-opensource-tools-explorer";
import { SectionMessage } from "@/components/home/section-message";

export const metadata: Metadata = buildMetadata({
  title: "Open Source Tools",
  description:
    "Browse open source tools curated on DevTunnel, searchable and filterable by language and label.",
  path: "/opensource-tools",
  // Private, authenticated-only application UI — never public content
  // (Frontend_Development_Rules.txt rule 18), same treatment
  // `/projects/page.tsx` and `/github-projects/page.tsx` document for
  // the same underlying reason: this route lives under the `(protected)`
  // route group, whose layout (`app/(protected)/layout.tsx`) requires a
  // backend-confirmed session via `getServerUser()` for every page
  // inside it, regardless of what `middleware.ts`'s `PROTECTED_PREFIXES`
  // list alone would suggest.
  noIndex: true,
});

/**
 * `/opensource-tools` — "Open Source Tools on Devtunnel" in
 * `AppSidebar`/`AppBottomNav`, previously a dead link (the nav item
 * existed, but no route did — same gap `/projects/page.tsx` and
 * `/github-projects/page.tsx` each filled for their own nav entries).
 * Distinct from `/github-open-source-tools` ("Github Open source
 * tools"): that's the live, GitHub-wide catalog of developer tools;
 * this is DevTunnel's own curated list — the tools DevTunnel has
 * actually onboarded (`devtunnel.opensource_tools`, sql/017) — same
 * "GitHub-wide catalog vs. DevTunnel's own curated list" pairing
 * `AppSidebar`'s own doc comment describes for Projects.
 *
 * Deliberately designed to match `/github-open-source-tools`
 * (`app/(protected)/github-open-source-tools/page.tsx`): same page
 * shell, same search-box-plus-filter-dropdowns-plus-card-grid-plus-
 * pagination shape, same card layout (`DevtunnelOpenSourceToolCard`
 * mirrors `GithubProjectCard`). Only the underlying data and its filters
 * differ — `OpenSourceToolSummary` (`lib/opensource-tools/types.ts`) has
 * no star/fork/trending data to offer, so Language/Label/Sort stand in
 * for that page's Tech stack/Minimum stars/Sort by.
 */
export default async function OpenSourceToolsPage() {
  const result = await getOpenSourceTools();

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="m-0 mb-1 text-xl font-medium text-text">Open Source Tools on Devtunnel</h1>
        <p className="m-0 text-sm text-text-muted">
          Developer tools curated on DevTunnel — search or filter by language and label to find
          one worth using.
        </p>
      </div>

      {result.status === "error" ? (
        <SectionMessage>
          Open source tools aren&apos;t available yet — check back soon.
        </SectionMessage>
      ) : result.status === "empty" ? (
        <SectionMessage>No open source tools have been added yet — check back soon.</SectionMessage>
      ) : (
        <DevtunnelOpenSourceToolsExplorer tools={result.data} />
      )}
    </main>
  );
}