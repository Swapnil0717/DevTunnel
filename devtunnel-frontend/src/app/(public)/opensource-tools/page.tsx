import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { getOpenSourceTools } from "@/lib/opensource-tools/api";
import { DevtunnelOpenSourceToolsExplorer } from "@/components/opensource-tools/devtunnel-opensource-tools-explorer";
import { SectionMessage } from "@/components/home/section-message";
import RouteLoading from "./loading";
import { BlueprintReveal } from "@/components/ui/blueprint-reveal";

/**
 * Indexable when the list actually loaded (rules 2, 27); a failed or empty
 * fetch renders only an error/empty message, which has nothing worth
 * indexing (rule 23), so that response is `noindex`. The canonical URL
 * never carries the `?...` query string some links add (rule 8).
 *
 * Runs the same fetch the page itself makes — Next de-duplicates identical
 * server `fetch` calls within one request, so this costs no extra round trip.
 */
export async function generateMetadata(): Promise<Metadata> {
  const result = await getOpenSourceTools();

  return buildMetadata({
    title: "Open Source Tools",
    description:
      "Browse open source tools curated on DevTunnel, searchable and filterable by language and label.",
    path: "/opensource-tools",
    noIndex: result.status !== "ok",
  });
}

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
 * (`app/(public)/github-open-source-tools/page.tsx`): same page
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
    <BlueprintReveal skeleton={<RouteLoading />}>
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
    </BlueprintReveal>
  );
}